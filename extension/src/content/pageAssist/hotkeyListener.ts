import {
  eventMatchesShortcut,
  loadShortcutBindings,
  parseShortcutString,
  SHORTCUT_STORAGE_KEY,
  type ParsedShortcut,
  type ShortcutBindings,
} from '../../lib/shortcutBindings';
import { TUTOR_MSG } from '../../shared/tutorMessages';
import { getBestSelectionText, installSelectionCache, notePageSelection } from './pageSelection';

let bindings: ShortcutBindings | null = null;
let lastFireAt = 0;
let shiftSpaceArmedUntil = 0;

/** Always try these if storage binding is missing or stale. */
const FALLBACK_ASK: ParsedShortcut[] = [
  parseShortcutString('Command+W'),
  parseShortcutString('Ctrl+W'),
  parseShortcutString('MacCtrl+H'),
  parseShortcutString('Ctrl+H'),
].filter(Boolean) as ParsedShortcut[];

const FALLBACK_REGION: ParsedShortcut[] = [
  parseShortcutString('Command+Shift+W'),
  parseShortcutString('Ctrl+Shift+W'),
  parseShortcutString('MacCtrl+Shift+H'),
  parseShortcutString('Ctrl+Shift+H'),
].filter(Boolean) as ParsedShortcut[];

async function refreshBindings(): Promise<void> {
  bindings = await loadShortcutBindings();
}

function debouncedSend(type: string, extra?: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastFireAt < 1200) return;
  lastFireAt = now;
  void chrome.runtime.sendMessage({ type, ...extra }).catch(() => {
    /* background may restart — Chrome command is fallback */
  });
}

function matchesAsk(event: KeyboardEvent): boolean {
  if (eventMatchesShortcut(event, bindings?.ask ?? null)) return true;
  return FALLBACK_ASK.some((s) => eventMatchesShortcut(event, s));
}

function matchesRegionSingle(event: KeyboardEvent): boolean {
  if (bindings?.region?.kind === 'single' && eventMatchesShortcut(event, bindings.region.shortcut)) {
    return true;
  }
  return FALLBACK_REGION.some((s) => eventMatchesShortcut(event, s));
}

function regionBindingMatches(event: KeyboardEvent, region: ShortcutBindings['region']): boolean {
  if (matchesRegionSingle(event)) return true;
  if (!region || region.kind !== 'shift-space-h') return false;

  if (event.code === 'Space' && event.shiftKey && !event.repeat) {
    shiftSpaceArmedUntil = Date.now() + 900;
    event.preventDefault();
    event.stopPropagation();
    return false;
  }

  if (event.code === 'KeyH' && event.shiftKey && Date.now() <= shiftSpaceArmedUntil) {
    shiftSpaceArmedUntil = 0;
    return true;
  }

  return false;
}

function shouldIgnoreHotkeyTarget(target: EventTarget | null, forAsk: boolean): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('#hina-tutor-overlay-root')) return true;
  if (forAsk && getBestSelectionText()) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return false;
}

export function installPageHotkeys(): void {
  installSelectionCache();
  void refreshBindings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SHORTCUT_STORAGE_KEY]) {
      void refreshBindings();
    }
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (!bindings) return;
      if (event.repeat) return;
      if (matchesAsk(event)) {
        if (shouldIgnoreHotkeyTarget(event.target, true)) return;
        event.preventDefault();
        event.stopPropagation();
        notePageSelection();
        const selectionSnapshot = getBestSelectionText();
        debouncedSend(TUTOR_MSG.HOTKEY_ASK_CLIPBOARD, {
          selectionSnapshot: selectionSnapshot || undefined,
        });
        return;
      }

      if (shouldIgnoreHotkeyTarget(event.target, false)) return;

      if (regionBindingMatches(event, bindings.region)) {
        event.preventDefault();
        event.stopPropagation();
        debouncedSend(TUTOR_MSG.HOTKEY_CAPTURE_REGION);
      }
    },
    true
  );
}
