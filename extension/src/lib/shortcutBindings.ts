import {
  defaultShortcutForCommand,
  TUTOR_COMMANDS,
  type TutorCommandName,
} from './extensionCommands';

export const SHORTCUT_STORAGE_KEY = 'hina_tutor_shortcut_bindings';

export interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string; // KeyboardEvent.code e.g. KeyH
}

export type RegionBinding =
  | { kind: 'single'; shortcut: ParsedShortcut }
  | { kind: 'shift-space-h'; shift: boolean };

export interface ShortcutBindings {
  ask: ParsedShortcut | null;
  region: RegionBinding | null;
  askRaw: string;
  regionRaw: string;
}

function keyTokenToCode(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  if (/^Key[A-Z]$/.test(t)) return t;
  if (t.length === 1) return `Key${t.toUpperCase()}`;
  const named: Record<string, string> = {
    Space: 'Space',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
  };
  if (named[t]) return named[t];
  if (/^F\d{1,2}$/i.test(t)) return t.toUpperCase();
  return null;
}

function isShiftSpaceHChord(raw: string): boolean {
  const norm = raw.replace(/\s+/g, '').toLowerCase();
  return norm === 'shift+space+h' || norm === 'shift+space+keyh';
}

/** Parse Chrome-style shortcut string into keydown matcher. */
export function parseShortcutString(raw: string): ParsedShortcut | null {
  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const keyPart = parts[parts.length - 1];
  const code = keyTokenToCode(keyPart);
  if (!code) return null;

  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  return {
    ctrl: mods.some((m) => m === 'ctrl' || m === 'macctrl' || m === 'control'),
    alt: mods.some((m) => m === 'alt' || m === 'macalt' || m === 'option'),
    shift: mods.some((m) => m === 'shift'),
    meta: mods.some((m) => m === 'command' || m === 'cmd' || m === 'meta'),
    key: code,
  };
}

export function parseRegionBinding(raw: string): RegionBinding | null {
  if (isShiftSpaceHChord(raw)) {
    return { kind: 'shift-space-h', shift: true };
  }
  const single = parseShortcutString(raw);
  if (single) return { kind: 'single', shortcut: single };
  return null;
}

export function eventMatchesShortcut(event: KeyboardEvent, binding: ParsedShortcut | null): boolean {
  if (!binding) return false;
  if (event.code !== binding.key) return false;
  if (binding.shift !== event.shiftKey) return false;
  if (binding.alt !== event.altKey) return false;
  if (binding.meta !== event.metaKey) return false;

  const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  const wantCtrl = binding.ctrl;
  if (mac) {
    if (wantCtrl && !event.ctrlKey) return false;
    if (!wantCtrl && event.ctrlKey && !binding.meta) return false;
  } else if (wantCtrl !== event.ctrlKey) return false;

  return true;
}

export async function loadShortcutBindings(): Promise<ShortcutBindings> {
  const stored = await chrome.storage.local.get(SHORTCUT_STORAGE_KEY);
  const bag = stored[SHORTCUT_STORAGE_KEY] as { ask?: string; region?: string } | undefined;

  const askRaw = bag?.ask || defaultShortcutForCommand(TUTOR_COMMANDS.ASK_CLIPBOARD);
  const regionRaw = bag?.region || defaultShortcutForCommand(TUTOR_COMMANDS.CAPTURE_REGION);

  return {
    ask: parseShortcutString(askRaw),
    region: parseRegionBinding(regionRaw),
    askRaw,
    regionRaw,
  };
}

export async function saveShortcutBindings(ask: string, region: string): Promise<void> {
  await chrome.storage.local.set({
    [SHORTCUT_STORAGE_KEY]: { ask: ask.trim(), region: region.trim() },
  });
}

export async function saveShortcutForCommand(name: TutorCommandName, shortcut: string): Promise<void> {
  const current = await chrome.storage.local.get(SHORTCUT_STORAGE_KEY);
  const bag = (current[SHORTCUT_STORAGE_KEY] as { ask?: string; region?: string }) || {};
  if (name === TUTOR_COMMANDS.ASK_CLIPBOARD) bag.ask = shortcut.trim();
  if (name === TUTOR_COMMANDS.CAPTURE_REGION) bag.region = shortcut.trim();
  await chrome.storage.local.set({ [SHORTCUT_STORAGE_KEY]: bag });
}
