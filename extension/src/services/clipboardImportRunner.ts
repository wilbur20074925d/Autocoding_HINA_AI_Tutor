import { buildPayloadFromClipboardInput } from '../parsers/clipboardImport';
import { readContext, writeSyncStatus } from '../lib/contextStorage';
import { getSupabase } from '../lib/supabase';
import { upsertScrapedTurns } from './syncMessages';
import { BG_MESSAGE, STORAGE_KEYS } from '../shared/scrapeTypes';

async function persistPayload(payload: Awaited<ReturnType<typeof buildPayloadFromClipboardInput>>): Promise<number> {
  const ctx = await readContext();
  if (!ctx.classSessionId || !ctx.chatSessionId) {
    throw new Error('Select a class session and chat history in the side panel.');
  }

  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) {
    throw new Error('Sign in via the HINA side panel.');
  }

  const userId = sessionData.session.user.id;
  const count = await upsertScrapedTurns(userId, ctx.chatSessionId, payload);

  await writeSyncStatus({
    lastAt: new Date().toISOString(),
    lastError: null,
    lastUpserted: count,
    lastFingerprint: payload.fingerprint,
    pending: 0,
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastMessages]: {
      turns: payload.turns.slice(-12),
      transcriptPreview: payload.transcriptRaw.slice(0, 2000),
      at: payload.capturedAt,
    },
  });

  void chrome.runtime.sendMessage({ type: BG_MESSAGE.SYNC_STATUS });
  return count;
}

/** Runs in the side panel (has `window`) — not in the service worker. */
export async function runClipboardImport(raw: string): Promise<{ turnCount: number }> {
  const payload = await buildPayloadFromClipboardInput(raw);
  const count = await persistPayload(payload);
  return { turnCount: count };
}

