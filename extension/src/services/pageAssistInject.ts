import { appendDebugLog } from '../shared/debugLog';

type PingResult = { ok?: boolean; top?: boolean; fallback?: boolean; loaded?: boolean };

/** Main page-assist module (from web_accessible_resources), not the loader stub. */
export function pageAssistModulePath(): string | null {
  const manifest = chrome.runtime.getManifest();
  const groups = manifest.web_accessible_resources ?? [];
  for (const group of groups) {
    const resources = 'resources' in group ? group.resources : [];
    for (const resource of resources) {
      const path = typeof resource === 'string' ? resource : '';
      if (/^assets\/index\.ts-[\w-]+\.js$/.test(path) && !path.includes('loader')) {
        return path.replace(/^\//, '');
      }
    }
  }
  return null;
}

/** CRX loader stub — dynamically imports the page-assist module. */
export function pageAssistLoaderPath(): string | null {
  const manifest = chrome.runtime.getManifest();
  const scripts = manifest.content_scripts || [];
  const entry = scripts.find((cs) =>
    cs.matches?.some(
      (m) =>
        typeof m === 'string' &&
        (m === '<all_urls>' || m.includes('http://*/*') || m.includes('https://*/*'))
    )
  );
  const js = entry?.js?.map((p) => p.replace(/^\//, '')) || [];
  const loader = js.find((p) => p.includes('loader') && p.includes('index.ts'));
  return loader || js[0] || null;
}

function lastChromeError(): string {
  return chrome.runtime.lastError?.message || '';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function sendPing(tabId: number, frameId?: number): Promise<PingResult | null> {
  try {
    const options = frameId !== undefined ? { frameId } : undefined;
    const res = await chrome.tabs.sendMessage(tabId, { type: 'HINA_PING' }, options);
    return (res as PingResult) ?? null;
  } catch {
    const detail = lastChromeError();
    if (detail) {
      await appendDebugLog('ping', `tab=${tabId} frame=${frameId ?? 'any'}: ${detail}`, 'warn');
    }
    return null;
  }
}

/** True only when the full page-assist bundle is listening in the top frame. */
export function isFullPageAssistPing(res: PingResult | null): boolean {
  if (!res?.ok) return false;
  if (res.fallback) return false;
  if (res.top === false) return false;
  return true;
}

export async function pingPageAssist(tabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const top = await sendPing(tabId, 0);
    if (isFullPageAssistPing(top)) return true;
    if (attempt < 5) await sleep(250 + attempt * 150);
  }
  return false;
}

async function waitForFullPageAssist(tabId: number, timeoutMs = 12_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingPageAssist(tabId)) return true;
    await sleep(200);
  }
  return false;
}

async function injectLoader(tabId: number, allFrames: boolean): Promise<void> {
  const loader = pageAssistLoaderPath();
  if (!loader) throw new Error('Extension build missing page loader. Rebuild and reload the extension.');
  await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    files: [loader],
  });
}

/** Fallback when dynamic import from the loader fails (some SPAs / strict pages). */
async function injectModuleViaScriptTag(tabId: number): Promise<void> {
  const modulePath = pageAssistModulePath();
  if (!modulePath) return;
  const src = chrome.runtime.getURL(modulePath);
  await appendDebugLog('inject', `module script tag ${modulePath}`);
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: (moduleUrl: string) => {
      const w = window as Window & { __hinaModuleTag?: boolean; __hinaPageAssistLoaded?: boolean };
      if (w.__hinaPageAssistLoaded || w.__hinaModuleTag) return;
      w.__hinaModuleTag = true;
      const script = document.createElement('script');
      script.type = 'module';
      script.src = moduleUrl;
      script.async = true;
      (document.head || document.documentElement).appendChild(script);
    },
    args: [src],
  });
}

export async function ensurePageAssist(tabId: number): Promise<void> {
  await appendDebugLog('inject', `ensurePageAssist tab=${tabId}`);

  if (await pingPageAssist(tabId)) {
    await appendDebugLog('inject', 'ping OK (full page assist)');
    return;
  }

  const loader = pageAssistLoaderPath();
  if (!loader) {
    await appendDebugLog('inject', 'no loader path in manifest', 'error');
    throw new Error('Extension build missing page loader. Rebuild and reload the extension.');
  }

  await appendDebugLog('inject', `injecting ${loader} (top frame)`);
  try {
    await injectLoader(tabId, false);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await appendDebugLog('inject', `loader inject failed: ${msg}`, 'warn');
  }

  if (await waitForFullPageAssist(tabId, 6000)) {
    await appendDebugLog('inject', 'ping OK after loader');
    return;
  }

  try {
    await injectModuleViaScriptTag(tabId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await appendDebugLog('inject', `module tag failed: ${msg}`, 'warn');
  }

  if (await waitForFullPageAssist(tabId, 6000)) {
    await appendDebugLog('inject', 'ping OK after module tag');
    return;
  }

  await appendDebugLog('inject', 'retry loader (all frames)', 'warn');
  try {
    await injectLoader(tabId, true);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await appendDebugLog('inject', `allFrames loader failed: ${msg}`, 'warn');
  }

  if (await waitForFullPageAssist(tabId, 6000)) {
    await appendDebugLog('inject', 'ping OK after allFrames loader');
    return;
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const url = tab?.url || 'unknown';
  await appendDebugLog('inject', `full page assist never loaded url=${url}`, 'error');
  throw new Error(
    `Could not start HINA on this page (${url}). Refresh the tab, then try the shortcut again.`
  );
}
