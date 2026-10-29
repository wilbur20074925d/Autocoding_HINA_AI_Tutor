export const OVERLAY_SNAPSHOT_KEY = 'hina_tutor_overlay_snapshot';

export function isPdfResourceUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return /\.pdf(?:$|[?#])/i.test(url);
  }
}

export async function saveOverlaySnapshot(dataUrl: string): Promise<void> {
  await chrome.storage.session.set({ [OVERLAY_SNAPSHOT_KEY]: dataUrl });
}

export async function readOverlaySnapshot(): Promise<string | null> {
  const stored = await chrome.storage.session.get(OVERLAY_SNAPSHOT_KEY);
  return (stored[OVERLAY_SNAPSHOT_KEY] as string | undefined) ?? null;
}

export async function clearOverlaySnapshot(): Promise<void> {
  await chrome.storage.session.remove(OVERLAY_SNAPSHOT_KEY);
}
