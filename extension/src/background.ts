import { BG_MESSAGE, STORAGE_KEYS, type ScrapePayload } from './shared/scrapeTypes';
import { readContext, writeSyncStatus } from './lib/contextStorage';
import { getSupabaseWorker } from './lib/supabaseWorker';
import { upsertScrapedTurns } from './services/syncMessages';
import { TUTOR_MSG } from './shared/tutorMessages';
import { captureRegionAndAsk, runTutorAsk } from './services/tutorOrchestrator';
import { ensurePageAssist, pageAssistLoaderPath, pingPageAssist } from './services/pageAssistInject';
import { appendDebugLog } from './shared/debugLog';
import { readTextForTutorAsk } from './services/tabClipboard';
import { saveShortcutBindings } from './lib/shortcutBindings';
import { clearShortcutFeedback, setShortcutFeedback } from './services/userFeedback';
import {
  clearOverlaySnapshot,
  isPdfResourceUrl,
  readOverlaySnapshot,
  saveOverlaySnapshot,
} from './services/overlaySnapshot';
import { isWebPageUrl, WEB_TAB_URL_PATTERNS } from './shared/webTabPatterns';

const lastSyncedFingerprintByTab = new Map<number, string>();

async function seedShortcutBindings(): Promise<void> {
  const os = await new Promise<string>((resolve) => {
    if (chrome.runtime.getPlatformInfo) {
      chrome.runtime.getPlatformInfo((info) => resolve(info.os));
      return;
    }
    resolve('win');
  });
  const mac = os === 'mac';
  await saveShortcutBindings(
    mac ? 'Command+W' : 'Ctrl+W',
    mac ? 'Command+Shift+W' : 'Ctrl+Shift+W'
  );
}

const BINDINGS_VERSION = '0.2.8';

chrome.runtime.onInstalled.addListener((details) => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.storage.local.set({ hina_tutor_bindings_version: BINDINGS_VERSION });
  void seedShortcutBindings();
  if (details.reason === 'update') {
    void chrome.storage.local
      .get(['hina_tutor_shortcut_bindings', 'hina_tutor_bindings_version'])
      .then((stored) => {
      const bag = stored.hina_tutor_shortcut_bindings as { ask?: string; region?: string } | undefined;
      const askNorm = (bag?.ask || '').replace(/\s/g, '');
      const regionNorm = (bag?.region || '').replace(/\s/g, '');
      const legacyAsk =
        /^(macctrl\+h|ctrl\+h|command\+h|shift\+h)$/i.test(askNorm);
      const legacyRegion =
        /^(macctrl\+shift\+h|ctrl\+shift\+h|command\+shift\+h|shift\+h)$/i.test(regionNorm) ||
        /shift\+space/i.test(regionNorm);
      const invalidAsk = !bag?.ask || legacyAsk;
      const invalidRegion = !bag?.region || legacyRegion;
      const storedVersion = (stored.hina_tutor_bindings_version as string | undefined) || '';
      if (storedVersion !== BINDINGS_VERSION || invalidAsk || invalidRegion) {
        void seedShortcutBindings();
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    void chrome.sidePanel.open({ tabId: tab.id });
  }
});

/** The tab the user is actually viewing (any normal http/https/file/ftp page). */
async function activeTabId(): Promise<number | undefined> {
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focused?.id && isWebPageUrl(focused.url)) return focused.id;

  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const ordered = [...windows].sort((a, b) => Number(b.focused) - Number(a.focused));

  for (const win of ordered) {
    const tabs = win.tabs || [];
    const active = tabs.find((t) => t.active);
    if (active?.id && isWebPageUrl(active.url)) return active.id;
    const web = tabs.find((t) => t.id !== undefined && isWebPageUrl(t.url));
    if (web?.id) return web.id;
  }

  const [any] = await chrome.tabs.query({ url: [...WEB_TAB_URL_PATTERNS] });
  return any?.id;
}

async function notifyTab(tabId: number, payload: Record<string, unknown>): Promise<void> {
  await ensurePageAssist(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await appendDebugLog('notify', `tab=${tabId} type=${String(payload.type)}: ${msg}`, 'error');
    throw error;
  }
}

function isUserAbort(message: string): boolean {
  return /cancel/i.test(message) || /too small/i.test(message);
}

async function pageNeedsInOverlayCrop(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (isPdfResourceUrl(tab?.url)) return true;
  try {
    await ensurePageAssist(tabId);
    const res = (await chrome.tabs.sendMessage(
      tabId,
      { type: TUTOR_MSG.CAN_HOST_OVERLAY },
      { frameId: 0 }
    )) as { canOverlay?: boolean };
    return res?.canOverlay === false;
  } catch {
    return false;
  }
}

async function showTabError(tabId: number | undefined, message: string): Promise<void> {
  await setShortcutFeedback(message, true);
  if (tabId === undefined) return;
  try {
    await notifyTab(tabId, { type: TUTOR_MSG.SHOW_OVERLAY, status: message });
  } catch {
    /* tab may not accept the content script */
  }
}

async function persistPayload(payload: ScrapePayload, tabId?: number): Promise<void> {
  const ctx = await readContext();
  if (!ctx.classSessionId || !ctx.chatSessionId) {
    await writeSyncStatus({
      lastError: 'Select a class session and chat history in the side panel.',
    });
    return;
  }

  const supabase = getSupabaseWorker();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) {
    await writeSyncStatus({ lastError: 'Sign in via the HINA side panel.' });
    return;
  }

  const userId = sessionData.session.user.id;

  try {
    const count = await upsertScrapedTurns(userId, ctx.chatSessionId, payload);
    if (tabId !== undefined) {
      lastSyncedFingerprintByTab.set(tabId, payload.fingerprint);
    }
    await writeSyncStatus({
      lastAt: new Date().toISOString(),
      lastError: null,
      lastUpserted: count,
      lastFingerprint: payload.fingerprint,
      pending: 0,
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.lastMessages]: {
        turns: payload.turns.slice(-12),
        transcriptPreview: payload.transcriptRaw.slice(0, 2000),
        at: payload.capturedAt,
      },
    });
    void chrome.runtime.sendMessage({ type: BG_MESSAGE.SYNC_STATUS });
  } catch (error) {
    await writeSyncStatus({
      lastError: error instanceof Error ? error.message : String(error),
    });
    void chrome.runtime.sendMessage({ type: BG_MESSAGE.SYNC_STATUS });
  }
}

async function handleScrape(payload: ScrapePayload, tabId?: number): Promise<void> {
  const ctx = await readContext();
  if (!ctx.captureEnabled) return;

  if (tabId !== undefined && lastSyncedFingerprintByTab.get(tabId) === payload.fingerprint) {
    return;
  }

  await persistPayload(payload, tabId);
}

async function clearPageCaptureUi(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        for (const id of [
          'hina-tutor-overlay-root',
          'hina-region-capture-mask',
          'hina-region-capture-box',
          'hina-region-capture-hint',
        ]) {
          document.getElementById(id)?.remove();
        }
      },
    });
  } catch {
    /* pdf viewer may reject injection; the reply window does not need the page ui */
  }
}

async function beginOverlaySnapshotSelection(tabId: number): Promise<void> {
  await clearPageCaptureUi(tabId);
  const tab = await chrome.tabs.get(tabId);
  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Could not capture this page.');
  }
  await saveOverlaySnapshot(dataUrl);
  await notifyTab(tabId, {
    type: TUTOR_MSG.SHOW_OVERLAY,
    status: 'Drag in the chat preview to select the question',
    cropMode: true,
  });
  await appendDebugLog('region', 'in-page overlay crop (PDF / blocked drag layer)');
}

/** @returns true when the reply window is waiting for a drag selection */
async function runRegionCaptureCommand(resolvedTabId: number): Promise<boolean> {
  if (await pageNeedsInOverlayCrop(resolvedTabId)) {
    await beginOverlaySnapshotSelection(resolvedTabId);
    return true;
  }

  type RegionPick = {
    ok?: boolean;
    rect?: { x: number; y: number; width: number; height: number };
    devicePixelRatio?: number;
    error?: string;
  };
  let picked: RegionPick | undefined;
  try {
    picked = (await chrome.tabs.sendMessage(
      resolvedTabId,
      { type: TUTOR_MSG.START_REGION_CAPTURE },
      { frameId: 0 }
    )) as RegionPick;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog('region', `in-page capture message failed: ${message}`, 'warn');
    await beginOverlaySnapshotSelection(resolvedTabId);
    return true;
  }

  if (!picked?.ok || !picked.rect) {
    const reason = picked?.error || 'Region capture failed.';
    await appendDebugLog('region', `in-page capture: ${reason}`, 'warn');
    if (isUserAbort(reason)) throw new Error(reason);
    await beginOverlaySnapshotSelection(resolvedTabId);
    return true;
  }

  await captureRegionAndAsk(resolvedTabId, picked.rect, picked.devicePixelRatio || 1);
  return false;
}

async function runClipboardHotkeyCommand(
  resolvedTabId: number,
  selectionSnapshot?: string
): Promise<void> {
  const { text, from } = await readTextForTutorAsk(resolvedTabId, { selectionSnapshot });
  await notifyTab(resolvedTabId, { type: TUTOR_MSG.SHOW_OVERLAY });
  await runTutorAsk({
    source: from === 'selection' ? 'selection-hotkey' : 'clipboard-hotkey',
    text,
    tabId: resolvedTabId,
    showOnPage: true,
  });
  await notifyTab(resolvedTabId, { type: TUTOR_MSG.OVERLAY_STATUS, status: null });
  await appendDebugLog('ask', `${from} chars=${text.length} preview=${text.slice(0, 80)}`);
}

let commandFlight: { key: string; at: number } | null = null;

async function runTutorCommand(
  kind: 'clipboard' | 'region',
  tabId?: number,
  selectionSnapshot?: string
): Promise<void> {
  const resolvedTabId = tabId ?? (await activeTabId());
  const now = Date.now();
  const flightKey = `${kind}:${resolvedTabId ?? 'none'}`;
  if (commandFlight?.key === flightKey && now - commandFlight.at < 2000) {
    await appendDebugLog('command', `ignored duplicate ${kind}`);
    return;
  }
  commandFlight = { key: flightKey, at: now };

  if (resolvedTabId === undefined) {
    throw new Error('Open a normal website tab (http/https), click the page, then try the shortcut.');
  }

  const tab = await chrome.tabs.get(resolvedTabId).catch(() => null);
  await appendDebugLog(
    'command',
    `${kind} tab=${resolvedTabId} url=${tab?.url?.slice(0, 100) ?? '?'}`
  );

  await setShortcutFeedback(
    kind === 'region' ? 'Drag to select the question area…' : 'Reading highlighted text…'
  );

  try {
    const waitingForSelection =
      kind === 'region'
        ? await runRegionCaptureCommand(resolvedTabId)
        : await runClipboardHotkeyCommand(resolvedTabId, selectionSnapshot).then(() => false);
    if (!waitingForSelection) await clearShortcutFeedback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showTabError(resolvedTabId, message);
    throw error;
  } finally {
    if (commandFlight?.key === flightKey) commandFlight = null;
  }
}

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    try {
      if (command === 'capture-question-region') {
        await runTutorCommand('region');
        return;
      }
      if (command === 'ask-from-clipboard') {
        await runTutorCommand('clipboard');
      }
    } catch {
      /* showTabError already ran */
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === BG_MESSAGE.SCRAPE && message.payload) {
    void handleScrape(message.payload as ScrapePayload, sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (
    message?.type === TUTOR_MSG.HOTKEY_ASK_CLIPBOARD ||
    message?.type === TUTOR_MSG.HOTKEY_CAPTURE_REGION
  ) {
    void (async () => {
      try {
        const tabId = sender.tab?.id ?? (await activeTabId());
        const selectionSnapshot =
          typeof message.selectionSnapshot === 'string' ? message.selectionSnapshot : undefined;
        if (message.type === TUTOR_MSG.HOTKEY_CAPTURE_REGION) {
          await runTutorCommand('region', tabId);
        } else {
          await runTutorCommand('clipboard', tabId, selectionSnapshot);
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.DIAGNOSE_TAB) {
    void (async () => {
      try {
        const tabId = await activeTabId();
        const loader = pageAssistLoaderPath();
        if (tabId === undefined) {
          await appendDebugLog('diagnose', 'no active web tab', 'error');
          sendResponse({ ok: false, error: 'No active website tab.' });
          return;
        }
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url || '';
        await appendDebugLog('diagnose', `tab ${tabId} ${url}`);
        let ping = await pingPageAssist(tabId);
        if (!ping) {
          try {
            await ensurePageAssist(tabId);
            ping = await pingPageAssist(tabId);
          } catch (error) {
            await appendDebugLog('diagnose', error instanceof Error ? error.message : String(error), 'error');
          }
        }
        sendResponse({ ok: true, tabId, url, ping, loader });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.TEST_CLIPBOARD) {
    void (async () => {
      try {
        await runTutorCommand('clipboard');
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.TEST_REGION) {
    void (async () => {
      try {
        await runTutorCommand('region');
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.OVERLAY_GET_SNAPSHOT) {
    void (async () => {
      const imageDataUrl = await readOverlaySnapshot();
      sendResponse({ ok: Boolean(imageDataUrl), imageDataUrl });
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.OVERLAY_CROP_ASK && typeof message.imageDataUrl === 'string') {
    void (async () => {
      try {
        const tabId = sender.tab?.id ?? (await activeTabId());
        await clearOverlaySnapshot();
        await setShortcutFeedback('Analyzing screenshot…');
        await runTutorAsk({
          source: 'screenshot-hotkey',
          text: '',
          imageDataUrl: message.imageDataUrl,
          tabId,
          showOnPage: true,
        });
        await clearShortcutFeedback();
        sendResponse({ ok: true });
      } catch (error) {
        const errText = error instanceof Error ? error.message : String(error);
        await setShortcutFeedback(errText, true);
        sendResponse({ ok: false, error: errText });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.ASK_TEXT && typeof message.text === 'string') {
    void (async () => {
      try {
        const tabId = sender.tab?.id ?? (await activeTabId());
        const result = await runTutorAsk({
          source: 'paste',
          text: message.text,
          tabId,
          showOnPage: true,
        });
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message?.type === TUTOR_MSG.OVERLAY_USER_MESSAGE && typeof message.text === 'string') {
    void (async () => {
      try {
        const tabId = sender.tab?.id ?? (await activeTabId());
        const result = await runTutorAsk({
          source: 'overlay-followup',
          text: message.text,
          tabId,
          showOnPage: true,
        });
        sendResponse({ ok: true, assistant: result.assistant });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  return false;
});
