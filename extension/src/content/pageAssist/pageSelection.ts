/** Text the user highlighted on the page (not the system clipboard). */
export function readSelectedTextOnPage(): string {
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

  if (active instanceof HTMLElement && active.isContentEditable) {
    const text = sel?.toString?.() ?? '';
    if (text.trim()) return text.trim();
  }

  return '';
}

const SELECTION_STORAGE_KEY = 'hina_last_selection';

let cachedSelection: { text: string; at: number } | null = null;

function writeSelectionCache(text: string, at: number): void {
  cachedSelection = { text, at };
  try {
    sessionStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ text, at }));
  } catch {
    /* private mode / blocked storage */
  }
}

function readSelectionCache(maxAgeMs: number): string {
  if (cachedSelection && Date.now() - cachedSelection.at <= maxAgeMs) {
    return cachedSelection.text;
  }
  try {
    const raw = sessionStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { text?: string; at?: number };
    if (parsed.text && parsed.at && Date.now() - parsed.at <= maxAgeMs) {
      cachedSelection = { text: parsed.text, at: parsed.at };
      return parsed.text;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Remember the latest non-empty highlight (survives focus loss after the shortcut). */
export function notePageSelection(): void {
  const text = readSelectedTextOnPage();
  if (text) writeSelectionCache(text, Date.now());
}

/** Live selection first, then a recent cached highlight (default 2 minutes). */
export function getBestSelectionText(maxAgeMs = 120_000): string {
  const live = readSelectedTextOnPage();
  if (live) {
    writeSelectionCache(live, Date.now());
    return live;
  }
  return readSelectionCache(maxAgeMs);
}

/** Same cache key for injected fallback readers (isolated copy in tabClipboard). */
export const HINA_SELECTION_STORAGE_KEY = SELECTION_STORAGE_KEY;

declare global {
  interface Window {
    __hinaSelectionCacheInstalled?: boolean;
  }
}

export function installSelectionCache(): void {
  if (window.__hinaSelectionCacheInstalled) return;
  window.__hinaSelectionCacheInstalled = true;

  const refresh = () => notePageSelection();
  document.addEventListener('selectionchange', refresh);
  document.addEventListener('mouseup', refresh);
  document.addEventListener('keyup', refresh);
}
