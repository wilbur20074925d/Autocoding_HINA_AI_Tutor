/**
 * Runs in the ChatGPT tab (MAIN world) via chrome.scripting.executeScript.
 * Uses the same session + /backend-api/conversation/{id} path as ChatGPT's UI.
 * Must stay self-contained — no imports.
 */
export function fetchChatGptConversationInPage(conversationId: string): Promise<{
  ok: boolean;
  transcript?: string;
  turnCount?: number;
  error?: string;
}> {
  function textFromMessage(message: {
    content?: { parts?: unknown[]; content_type?: string };
    metadata?: { is_visually_hidden_from_conversation?: boolean };
  } | null): string {
    if (!message?.content?.parts) return '';
    const parts = message.content.parts;
    return parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function isHidden(message: {
    metadata?: { is_visually_hidden_from_conversation?: boolean };
    content?: { content_type?: string };
  } | null): boolean {
    if (!message) return true;
    if (message.metadata?.is_visually_hidden_from_conversation) return true;
    if (message.content?.content_type === 'user_editable_context') return true;
    return false;
  }

  return (async () => {
    try {
      const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      if (!sessionRes.ok) {
        return { ok: false, error: `ChatGPT session check failed (${sessionRes.status}). Log in at chatgpt.com first.` };
      }
      const session = (await sessionRes.json()) as { accessToken?: string };
      const token = session?.accessToken;
      if (!token) {
        return { ok: false, error: 'Not logged in to ChatGPT in this browser tab.' };
      }

      const convRes = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (convRes.status === 404) {
        return { ok: false, error: 'Conversation not found. Open the chat in ChatGPT while logged in.' };
      }
      if (!convRes.ok) {
        return { ok: false, error: `ChatGPT API returned ${convRes.status}. Refresh the chat tab and try again.` };
      }

      const data = (await convRes.json()) as {
        current_node?: string;
        mapping?: Record<
          string,
          {
            id?: string;
            parent?: string;
            message?: {
              id?: string;
              role?: string;
              author?: { role?: string };
              create_time?: number;
              content?: { parts?: unknown[]; content_type?: string };
              metadata?: { is_visually_hidden_from_conversation?: boolean };
            };
          }
        >;
      };

      const mapping = data.mapping || {};
      const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      if (data.current_node && mapping[data.current_node]) {
        let nodeId: string | undefined = data.current_node;
        const chain: Array<{ role: 'user' | 'assistant'; content: string }> = [];
        while (nodeId) {
          const node = mapping[nodeId];
          if (!node) break;
          const message = node.message;
          const role = message?.author?.role ?? message?.role;
          if ((role === 'user' || role === 'assistant') && !isHidden(message)) {
            const text = textFromMessage(message);
            if (text) chain.push({ role, content: text });
          }
          nodeId = node.parent;
        }
        chain.reverse();
        turns.push(...chain);
      }

      if (turns.length === 0) {
        const nodes = Object.values(mapping)
          .filter((node) => node?.message && !isHidden(node.message))
          .sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));

        for (const node of nodes) {
          const message = node.message;
          const role = message?.author?.role ?? message?.role;
          if (role !== 'user' && role !== 'assistant') continue;
          const text = textFromMessage(message);
          if (!text) continue;
          turns.push({ role, content: text });
        }
      }

      if (turns.length === 0) {
        return { ok: false, error: 'ChatGPT returned a conversation with no readable messages.' };
      }

      const transcript = turns
        .map((turn) => {
          const speaker = turn.role === 'user' ? 'You' : 'ChatGPT';
          return `${speaker}\n\n${turn.content}`;
        })
        .join('\n\n---\n\n');

      return { ok: true, transcript, turnCount: turns.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })();
}
