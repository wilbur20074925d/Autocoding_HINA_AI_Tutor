import { getSupabase } from '../lib/supabase';
import type { ScrapePayload } from '../shared/scrapeTypes';

const HINA_MESSAGES = 'HINA_chat_messages';

/**
 * Incremental upsert only — never prunes messages missing from this payload
 * (unlike the web app's full saveSessionMessages).
 */
export async function upsertScrapedTurns(
  userId: string,
  chatSessionId: string,
  payload: ScrapePayload
): Promise<number> {
  if (payload.turns.length === 0) return 0;

  const supabase = getSupabase();
  const rows = payload.turns.map((turn) => ({
    session_id: chatSessionId,
    user_id: userId,
    client_message_id:
      payload.platform === 'hina-tutor-local'
        ? turn.clientMessageId
        : payload.platform === 'clipboard' || payload.platform === 'chatgpt-share'
          ? `ext:${payload.platform}:${payload.threadKey}:${turn.clientMessageId}`
          : `ext:${payload.platform}:${payload.threadKey}:${turn.clientMessageId}`,
    role: turn.role,
    content: turn.content,
    turn_number: turn.turnNumber,
    metadata: {
      source: 'chrome_extension',
      platform: payload.platform,
      url: payload.url,
      thread_key: payload.threadKey,
      transcript_hash: payload.fingerprint,
      captured_at: payload.capturedAt,
      adapter:
        payload.platform === 'hina-tutor-local'
          ? 'hina-tutor-bridge@1'
          : payload.platform === 'active-tab'
            ? 'active-tab@1'
            : payload.platform === 'clipboard' || payload.platform === 'chatgpt-share'
              ? 'clipboard@1'
              : 'chatgpt-dom@1',
    },
  }));

  const { error } = await supabase.from(HINA_MESSAGES).upsert(rows, {
    onConflict: 'session_id,client_message_id',
  });

  if (error) throw new Error(error.message);

  return rows.length;
}
