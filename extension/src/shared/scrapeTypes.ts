export type ScrapePlatform =
  | 'chatgpt'
  | 'hina-tutor-local'
  | 'clipboard'
  | 'chatgpt-share'
  | 'active-tab';

export interface ScrapedTurn {
  clientMessageId: string;
  role: 'user' | 'assistant';
  content: string;
  turnNumber: number;
}

/** Payload from content script → background (scrape interface). */
export interface ScrapePayload {
  platform: ScrapePlatform;
  url: string;
  threadKey: string;
  transcriptRaw: string;
  turns: ScrapedTurn[];
  capturedAt: string;
  fingerprint: string;
}

export const BG_MESSAGE = {
  SCRAPE: 'HINA_SCRAPE',
  IMPORT_CLIPBOARD: 'HINA_IMPORT_CLIPBOARD',
  SYNC_STATUS: 'HINA_SYNC_STATUS',
  CONTEXT_UPDATED: 'HINA_CONTEXT_UPDATED',
} as const;

export interface SyncStatus {
  lastAt: string | null;
  lastError: string | null;
  lastUpserted: number;
  lastFingerprint: string | null;
  pending: number;
}

export interface ExtensionContext {
  captureEnabled: boolean;
  classSessionId: string | null;
  classJoinCode: string | null;
  classTitle: string | null;
  chatSessionId: string | null;
  chatTitle: string | null;
}

export const STORAGE_KEYS = {
  context: 'hina_ext_context',
  syncStatus: 'hina_ext_sync_status',
  lastMessages: 'hina_ext_last_messages_preview',
} as const;

export const defaultContext = (): ExtensionContext => ({
  captureEnabled: false,
  classSessionId: null,
  classJoinCode: null,
  classTitle: null,
  chatSessionId: null,
  chatTitle: null,
});
