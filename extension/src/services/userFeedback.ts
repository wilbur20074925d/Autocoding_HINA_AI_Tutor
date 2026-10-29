import { appendDebugLog } from '../shared/debugLog';

const LAST_ERROR_KEY = 'hina_tutor_last_shortcut_error';

export async function setShortcutFeedback(message: string, isError = false): Promise<void> {
  const badgeText = message.slice(0, 120);
  try {
    await chrome.action.setBadgeText({ text: isError ? '!' : '…' });
    await chrome.action.setBadgeBackgroundColor({ color: isError ? '#dc2626' : '#2563eb' });
    await chrome.action.setTitle({ title: `HINA AI Tutor — ${badgeText}` });
  } catch {
    /* ignore */
  }
  if (isError) {
    await chrome.storage.local.set({
      [LAST_ERROR_KEY]: { message, at: new Date().toISOString() },
    });
    await appendDebugLog('shortcut', message, 'error');
  }
}

export async function clearShortcutFeedback(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Open HINA Tutor' });
  } catch {
    /* ignore */
  }
}

export async function readLastShortcutError(): Promise<string | null> {
  const stored = await chrome.storage.local.get(LAST_ERROR_KEY);
  const row = stored[LAST_ERROR_KEY] as { message?: string } | undefined;
  return row?.message ?? null;
}
