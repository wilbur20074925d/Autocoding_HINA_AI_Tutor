import { ensurePageAssist } from './pageAssistInject';

export type TabAskTextSource = 'selection' | 'clipboard';

export async function readTextForTutorAsk(
  tabId: number,
  options?: { selectionSnapshot?: string }
): Promise<{ text: string; from: TabAskTextSource }> {
  const snap = options?.selectionSnapshot?.trim();
  if (snap) {
    return { text: snap, from: 'selection' };
  }

  await ensurePageAssist(tabId);

  try {
    const viaMessage = (await chrome.tabs.sendMessage(tabId, { type: 'HINA_TUTOR_READ_CLIPBOARD' })) as {
      ok?: boolean;
      text?: string;
      from?: TabAskTextSource;
      error?: string;
    };
    if (viaMessage?.ok && viaMessage.text?.trim()) {
      return {
        text: viaMessage.text.trim(),
        from: viaMessage.from === 'selection' ? 'selection' : 'clipboard',
      };
    }
  } catch {
    /* fall through to injection */
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const CACHE_KEY = 'hina_last_selection';
      const readCached = (): string => {
        try {
          const raw = sessionStorage.getItem(CACHE_KEY);
          if (!raw) return '';
          const parsed = JSON.parse(raw) as { text?: string; at?: number };
          if (parsed.text && parsed.at && Date.now() - parsed.at <= 120_000) return parsed.text;
        } catch {
          /* ignore */
        }
        return '';
      };

      const readSelected = (): string => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const fromRange = sel.toString();
          if (fromRange.trim()) return fromRange.trim();
        }
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
          const start = active.selectionStart;
          const end = active.selectionEnd;
          if (start != null && end != null && end > start) {
            const slice = active.value.slice(start, end).trim();
            if (slice) return slice;
          }
        }
        return readCached();
      };

      const selected = readSelected();
      if (selected) return { ok: true as const, text: selected, from: 'selection' as const };

      try {
        const text = await navigator.clipboard.readText();
        return { ok: true as const, text, from: 'clipboard' as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const payload = result as
    | { ok: true; text: string; from: TabAskTextSource }
    | { ok: false; error?: string };

  if (payload?.ok && payload.text?.trim()) {
    return {
      text: payload.text.trim(),
      from: payload.from === 'selection' ? 'selection' : 'clipboard',
    };
  }

  throw new Error(
    payload && 'error' in payload && payload.error
      ? payload.error
      : 'Highlight your question on the page, then press the ask shortcut (no copy needed). Or copy (⌘C / Ctrl+C) and try again.'
  );
}

/** @deprecated Use readTextForTutorAsk */
export async function readTextFromTabClipboard(tabId: number): Promise<string> {
  const { text } = await readTextForTutorAsk(tabId);
  return text;
}
