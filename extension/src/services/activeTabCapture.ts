import { scrapeVisibleChatDocument } from '../content/share/scrapeVisibleChatDocument';
import {
  captureChatGptConversationViaApi,
  isChatGptConversationUrl,
} from './chatGptConversationApi';

const SCRAPE_MSG = 'HINA_SCRAPE_SHARE_PAGE';

const CHAT_TAB_URL_RE =
  /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google|copilot\.microsoft/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isChatPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  return CHAT_TAB_URL_RE.test(url);
}

/** Side-panel clicks can leave a non-chat tab "active" — prefer a visible chat tab in the window. */
async function resolveTargetTabId(): Promise<{ tabId: number; url: string }> {
  const [activeInFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeInFocused?.id && isChatPageUrl(activeInFocused.url)) {
    return { tabId: activeInFocused.id, url: activeInFocused.url || '' };
  }

  const windowTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const active = windowTabs.find((t) => t.active);
  if (active?.id && isChatPageUrl(active.url)) {
    return { tabId: active.id, url: active.url || '' };
  }

  const chatTabs = windowTabs.filter((t) => t.id !== undefined && isChatPageUrl(t.url));
  const shareTab = chatTabs.find((t) => /\/share\//i.test(t.url || ''));
  if (shareTab?.id !== undefined) {
    return { tabId: shareTab.id, url: shareTab.url || '' };
  }

  const conversationTab = chatTabs.find((t) => /\/c\//i.test(t.url || ''));
  if (conversationTab?.id !== undefined) {
    return { tabId: conversationTab.id, url: conversationTab.url || '' };
  }

  if (chatTabs.length === 1 && chatTabs[0].id !== undefined) {
    return { tabId: chatTabs[0].id, url: chatTabs[0].url || '' };
  }

  if (active?.id) {
    return { tabId: active.id, url: active.url || '' };
  }

  throw new Error('No browser tab found. Open the ChatGPT chat, click that tab, then Capture.');
}

type ScrapePayload = {
  ok: boolean;
  transcript?: string;
  pageUrl?: string;
  error?: string;
  debug?: { roleNodes: number; articles: number; mainTextLength?: number };
};

async function scrapeViaInjection(tabId: number): Promise<ScrapePayload | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleChatDocument,
  });
  return (result as ScrapePayload | undefined) ?? null;
}

async function scrapeViaContentScript(tabId: number): Promise<string | null> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { type: SCRAPE_MSG })) as
      | { ok: true; transcript: string }
      | { ok: false; error?: string }
      | undefined;
    if (response?.ok && response.transcript?.trim()) {
      return response.transcript;
    }
  } catch {
    /* content script not loaded on this URL */
  }
  return null;
}

/**
 * Read the chat currently rendered in the user's Chrome tab (share page, ChatGPT, etc.).
 */
export async function captureActiveTabTranscript(): Promise<{ transcript: string; pageUrl: string }> {
  const { tabId, url: resolvedUrl } = await resolveTargetTabId();

  if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
    throw new Error(
      `Active tab is not a chat page (${resolvedUrl || 'unknown URL'}). Open chatgpt.com/c/… or a share link first.`
    );
  }

  if (!isChatPageUrl(resolvedUrl)) {
    throw new Error(
      `This tab does not look like a chat page: ${resolvedUrl}. Open your ChatGPT conversation, select that tab, then Capture.`
    );
  }

  let lastDetail = 'No chat visible on this tab yet.';

  if (isChatGptConversationUrl(resolvedUrl)) {
    try {
      const fromApi = await captureChatGptConversationViaApi(tabId, resolvedUrl);
      if (fromApi) return fromApi;
    } catch (apiError) {
      lastDetail = apiError instanceof Error ? apiError.message : String(apiError);
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const fromCs = await scrapeViaContentScript(tabId);
      if (fromCs) {
        return { transcript: fromCs, pageUrl: resolvedUrl };
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    try {
      const payload = await scrapeViaInjection(tabId);
      if (payload?.ok && payload.transcript?.trim()) {
        return { transcript: payload.transcript, pageUrl: payload.pageUrl || resolvedUrl };
      }
      if (payload?.error) {
        const dbg = payload.debug;
        lastDetail = payload.error;
        if (dbg) {
          lastDetail += ` (found ${dbg.roleNodes} role nodes, ${dbg.articles} articles`;
          if (dbg.mainTextLength !== undefined) {
            lastDetail += `, main text ${dbg.mainTextLength} chars`;
          }
          lastDetail += ')';
        }
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    await sleep(800);
  }

  throw new Error(
    `${lastDetail} Tab: ${resolvedUrl}. For logged-in chats use a /c/… URL while signed in to ChatGPT, or copy the conversation and use Import from clipboard.`
  );
}
