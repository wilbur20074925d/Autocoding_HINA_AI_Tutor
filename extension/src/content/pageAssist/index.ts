import { pickScreenRegion } from './regionSelector';
import { tutorOverlay } from './overlayPanel';
import { installPageHotkeys } from './hotkeyListener';
import { getBestSelectionText, installSelectionCache, readSelectedTextOnPage } from './pageSelection';
import { TUTOR_MSG } from '../../shared/tutorMessages';
import { appendDebugLog } from '../../shared/debugLog';

declare global {
  interface Window {
    __hinaPageAssistLoaded?: boolean;
    __hinaHotkeysInstalled?: boolean;
  }
}

const isTopFrame = window === window.top;

function pageCanHostOverlay(): boolean {
  if (document.contentType === 'application/pdf') return false;
  const blockers = document.querySelectorAll('embed, object');
  for (const node of blockers) {
    const el = node as HTMLElement;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const src = (el.getAttribute('src') || '').toLowerCase();
    const pdfish =
      type.includes('pdf') ||
      src.includes('.pdf') ||
      src.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai') ||
      el.tagName === 'EMBED';
    if (!pdfish) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width >= window.innerWidth * 0.7 && rect.height >= window.innerHeight * 0.7) return false;
  }
  return true;
}

if (!window.__hinaHotkeysInstalled) {
  window.__hinaHotkeysInstalled = true;
  installSelectionCache();
  installPageHotkeys();
}

void appendDebugLog(
  'page',
  `assist loaded ${location.href.slice(0, 120)} top=${isTopFrame}`
);

function registerTopFrameUi(): void {
  if (!isTopFrame || window.__hinaPageAssistLoaded) return;
  window.__hinaPageAssistLoaded = true;
}

registerTopFrameUi();
if (isTopFrame) {
  window.__hinaPageAssistLoaded = true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type as string | undefined;

  if (type === 'HINA_PING') {
    sendResponse({
      ok: true,
      top: isTopFrame,
      fallback: false,
      loaded: Boolean(window.__hinaPageAssistLoaded),
    });
    return false;
  }

  if (!isTopFrame) {
    return false;
  }

  if (type === TUTOR_MSG.CAN_HOST_OVERLAY) {
    const canOverlay = pageCanHostOverlay();
    void appendDebugLog('page', `canOverlay=${canOverlay} type=${document.contentType}`);
    sendResponse({ ok: true, canOverlay });
    return false;
  }

  if (type === TUTOR_MSG.OVERLAY_VISIBLE) {
    sendResponse({ ok: true, visible: tutorOverlay.isVisible() });
    return false;
  }

  if (type === TUTOR_MSG.SHOW_OVERLAY) {
    tutorOverlay.ensureMounted();
    tutorOverlay.dockBottomRight();
    if (message.status) tutorOverlay.setStatus(String(message.status));
    if (Array.isArray(message.messages)) tutorOverlay.appendMessages(message.messages);
    if (message.cropMode) {
      void tutorOverlay.startCropFromSnapshot();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (type === TUTOR_MSG.OVERLAY_APPEND) {
    tutorOverlay.ensureMounted();
    if (Array.isArray(message.messages)) tutorOverlay.appendMessages(message.messages);
    sendResponse({ ok: true });
    return false;
  }

  if (type === TUTOR_MSG.OVERLAY_STATUS) {
    tutorOverlay.ensureMounted();
    tutorOverlay.setStatus(message.status ? String(message.status) : null);
    sendResponse({ ok: true });
    return false;
  }

  if (type === TUTOR_MSG.OVERLAY_THINKING) {
    tutorOverlay.ensureMounted();
    if (message.active) {
      tutorOverlay.showThinking(message.label ? String(message.label) : undefined);
    } else {
      tutorOverlay.hideThinking();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (type === TUTOR_MSG.START_REGION_CAPTURE) {
    void (async () => {
      try {
        tutorOverlay.suspendForRegionCapture();
        const rect = await pickScreenRegion();
        tutorOverlay.resumeAfterRegionCapture();
        tutorOverlay.ensureMounted();
        tutorOverlay.dockBottomRight();
        tutorOverlay.setStatus('Reading screenshot…');
        sendResponse({
          ok: true,
          rect,
          devicePixelRatio: window.devicePixelRatio || 1,
        });
      } catch (error) {
        tutorOverlay.resumeAfterRegionCapture();
        tutorOverlay.ensureMounted();
        tutorOverlay.setStatus(error instanceof Error ? error.message : String(error));
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (type === 'HINA_TUTOR_READ_CLIPBOARD') {
    void (async () => {
      const selected = getBestSelectionText();
      if (selected) {
        sendResponse({ ok: true, text: selected, from: 'selection' as const });
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        sendResponse({ ok: true, text, from: 'clipboard' as const });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not read clipboard on this tab.',
        });
      }
    })();
    return true;
  }

  return false;
});
