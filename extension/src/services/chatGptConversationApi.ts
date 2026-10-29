import { fetchChatGptConversationInPage } from '../content/chatgpt/fetchConversationInPage';

export function chatGptConversationIdFromUrl(url: string): string | null {
  const match = url.match(/\/c\/([a-f0-9-]{8,})/i);
  return match?.[1] ?? null;
}

export function isChatGptConversationUrl(url: string): boolean {
  return /chatgpt\.com|chat\.openai\.com/i.test(url) && chatGptConversationIdFromUrl(url) !== null;
}

/**
 * Load the full conversation through ChatGPT's backend API (logged-in /c/ URLs).
 * Runs fetch in the page MAIN world so session cookies apply.
 */
export async function captureChatGptConversationViaApi(
  tabId: number,
  pageUrl: string
): Promise<{ transcript: string; pageUrl: string } | null> {
  const conversationId = chatGptConversationIdFromUrl(pageUrl);
  if (!conversationId) return null;

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: fetchChatGptConversationInPage,
    args: [conversationId],
  });

  const payload = result as {
    ok: boolean;
    transcript?: string;
    error?: string;
  };

  if (payload?.ok && payload.transcript?.trim()) {
    return { transcript: payload.transcript, pageUrl };
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return null;
}
