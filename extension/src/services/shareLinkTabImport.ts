import { scrapeVisibleChatDocument } from '../content/share/scrapeVisibleChatDocument';

const SCRAPE_MSG = 'HINA_SCRAPE_SHARE_PAGE';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isShareUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /chatgpt\.com\/share\/|chat\.openai\.com\/share\//i.test(url);
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const onUpdated = (updatedId: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (updatedId !== tabId) return;
      if (info.status === 'complete' && isShareUrl(tab.url)) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);

    const poll = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete' && isShareUrl(tab.url)) {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
          return;
        }
      } catch (error) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(error);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Share page took too long to load.'));
        return;
      }
      setTimeout(poll, 300);
    };

    void poll();
  });
}

async function scrapeViaScriptInjection(tabId: number): Promise<string | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleChatDocument,
  });
  const payload = result as { ok: boolean; transcript?: string; error?: string } | undefined;
  if (payload?.ok && payload.transcript?.trim()) {
    return payload.transcript;
  }
  return null;
}

async function scrapeViaContentScript(tabId: number): Promise<string | null> {
  const response = (await chrome.tabs.sendMessage(tabId, { type: SCRAPE_MSG })) as
    | { ok: true; transcript: string }
    | { ok: false; error?: string }
    | undefined;
  if (response?.ok && response.transcript?.trim()) {
    return response.transcript;
  }
  return null;
}

/**
 * Open ChatGPT share URL, wait for render, scrape DOM (script injection first).
 */
export async function importShareLinkViaTab(shareUrl: string): Promise<string> {
  const tab = await chrome.tabs.create({ url: shareUrl, active: true });
  const tabId = tab.id;
  if (tabId === undefined) {
    throw new Error('Could not open share link tab.');
  }

  try {
    await waitForTabComplete(tabId, 60000);
    await sleep(2000);

    let lastError = 'Could not read messages on the share page.';

    for (let attempt = 0; attempt < 18; attempt += 1) {
      try {
        const injected = await scrapeViaScriptInjection(tabId);
        if (injected) return injected;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      try {
        const fromCs = await scrapeViaContentScript(tabId);
        if (fromCs) return fromCs;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!/Receiving end does not exist/i.test(msg)) {
          lastError = msg;
        }
      }

      await sleep(1500);
    }

    throw new Error(
      `${lastError} Wait until the full chat is visible, then use Import again — or copy the conversation text manually.`
    );
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* tab may already be closed */
    }
  }
}
