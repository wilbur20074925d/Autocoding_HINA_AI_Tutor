import {
  defaultContext,
  STORAGE_KEYS,
  type ExtensionContext,
  type SyncStatus,
} from '../shared/scrapeTypes';

export async function readContext(): Promise<ExtensionContext> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.context);
  const raw = result[STORAGE_KEYS.context];
  if (!raw || typeof raw !== 'object') return defaultContext();
  return { ...defaultContext(), ...(raw as ExtensionContext) };
}

export async function writeContext(partial: Partial<ExtensionContext>): Promise<ExtensionContext> {
  const current = await readContext();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STORAGE_KEYS.context]: next });
  return next;
}

export async function readSyncStatus(): Promise<SyncStatus> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.syncStatus);
  const raw = result[STORAGE_KEYS.syncStatus];
  if (!raw || typeof raw !== 'object') {
    return { lastAt: null, lastError: null, lastUpserted: 0, lastFingerprint: null, pending: 0 };
  }
  return raw as SyncStatus;
}

export async function writeSyncStatus(partial: Partial<SyncStatus>): Promise<SyncStatus> {
  const current = await readSyncStatus();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STORAGE_KEYS.syncStatus]: next });
  return next;
}
