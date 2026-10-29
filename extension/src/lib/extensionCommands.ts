export const TUTOR_COMMANDS = {
  ASK_CLIPBOARD: 'ask-from-clipboard',
  CAPTURE_REGION: 'capture-question-region',
} as const;

export type TutorCommandName = (typeof TUTOR_COMMANDS)[keyof typeof TUTOR_COMMANDS];

export interface TutorCommandDef {
  name: TutorCommandName;
  label: string;
  hint: string;
  defaultShortcut: { mac: string; other: string };
}

export const TUTOR_COMMAND_DEFS: TutorCommandDef[] = [
  {
    name: TUTOR_COMMANDS.ASK_CLIPBOARD,
    label: 'Ask from clipboard',
    hint: 'Copy a question (Ctrl+C / ⌘C), then press this shortcut.',
    defaultShortcut: { mac: 'Command+W', other: 'Ctrl+W' },
  },
  {
    name: TUTOR_COMMANDS.CAPTURE_REGION,
    label: 'Screenshot question region',
    hint: 'Drag a box around the question; GPT-4o reads the screenshot.',
    defaultShortcut: { mac: 'Command+Shift+W', other: 'Ctrl+Shift+W' },
  },
];

/** Map UI shortcut → Chrome `commands` API (must include Ctrl/Alt/Command). */
export function chromeCommandShortcut(name: TutorCommandName, shortcut: string): string {
  const raw = shortcut.trim();
  if (name === TUTOR_COMMANDS.CAPTURE_REGION && /shift\s*\+\s*space\s*\+\s*h/i.test(raw)) {
    return isMacPlatform() ? 'Command+Shift+W' : 'Ctrl+Shift+W';
  }
  if (/^shift\+h$/i.test(raw.replace(/\s/g, ''))) {
    return isMacPlatform() ? 'Command+W' : 'Ctrl+W';
  }
  if (isMacPlatform() && /^ctrl\+/i.test(raw)) {
    return raw.replace(/^Ctrl/i, 'MacCtrl');
  }
  return raw;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function defaultShortcutForCommand(name: TutorCommandName): string {
  const def = TUTOR_COMMAND_DEFS.find((d) => d.name === name);
  if (!def) return '';
  return isMacPlatform() ? def.defaultShortcut.mac : def.defaultShortcut.other;
}

/** Turn a keydown in the side panel into a Chrome commands shortcut string. */
export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (event.key === 'Escape' || event.key === 'Tab') return null;

  const key = event.key.length === 1 ? event.key.toUpperCase() : normalizeNamedKey(event.key);
  if (!key || key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') {
    return null;
  }

  const parts: string[] = [];
  const mac = isMacPlatform();

  if (mac) {
    if (event.metaKey) parts.push('Command');
    if (event.ctrlKey) parts.push('MacCtrl');
    if (event.altKey) parts.push('MacAlt');
  } else {
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
  }
  if (event.shiftKey) parts.push('Shift');

  if (parts.length === 0) return null;

  parts.push(key);
  return parts.join('+');
}

function normalizeNamedKey(key: string): string | null {
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
  };
  if (map[key]) return map[key];
  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase();
  return null;
}

export function formatShortcutForDisplay(shortcut: string): string {
  if (!shortcut) return 'Not set';
  return shortcut
    .replace(/MacCtrl/g, '⌃')
    .replace(/MacAlt/g, '⌥')
    .replace(/Command/g, '⌘')
    .replace(/Ctrl/g, 'Ctrl');
}

export async function listExtensionCommands(): Promise<chrome.commands.Command[]> {
  return new Promise((resolve, reject) => {
    try {
      chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(commands);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function updateExtensionShortcut(name: TutorCommandName, shortcut: string): Promise<void> {
  const trimmed = shortcut.trim();
  if (!trimmed) {
    throw new Error('Shortcut cannot be empty.');
  }

  const { saveShortcutForCommand } = await import('./shortcutBindings');
  await saveShortcutForCommand(name, trimmed);

  if (typeof chrome.commands.update === 'function') {
    try {
      await chrome.commands.update({ name, shortcut: chromeCommandShortcut(name, trimmed) });
    } catch {
      /* Page hotkeys in storage still work — set chrome://extensions/shortcuts if needed */
    }
  }
}

export async function resetExtensionShortcut(name: TutorCommandName): Promise<void> {
  await updateExtensionShortcut(name, defaultShortcutForCommand(name));
}
