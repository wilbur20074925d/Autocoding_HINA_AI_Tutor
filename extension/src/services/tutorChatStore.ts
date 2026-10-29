import { getSupabase } from '../lib/supabase';
import type { TutorAskSource } from '../shared/tutorMessages';

const HINA_MESSAGES = 'HINA_chat_messages';
const HINA_SESSIONS = 'HINA_chat_sessions';

export interface TutorTurn {
  role: 'user' | 'assistant';
  content: string;
}

const memoryBySession = new Map<string, TutorTurn[]>();

export function getMemoryThread(chatSessionId: string): TutorTurn[] {
  return memoryBySession.get(chatSessionId) ?? [];
}

export function appendMemory(chatSessionId: string, user: string, assistant: string): void {
  const thread = memoryBySession.get(chatSessionId) ?? [];
  thread.push({ role: 'user', content: user });
  thread.push({ role: 'assistant', content: assistant });
  memoryBySession.set(chatSessionId, thread.slice(-24));
}

export async function loadRecentThread(
  userId: string,
  chatSessionId: string,
  limit = 12
): Promise<TutorTurn[]> {
  const cached = memoryBySession.get(chatSessionId);
  if (cached && cached.length > 0) return cached;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(HINA_MESSAGES)
    .select('role, content, turn_number, metadata')
    .eq('session_id', chatSessionId)
    .eq('user_id', userId)
    .order('turn_number', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data || [])
    .filter((row) => (row.metadata as { tutor?: boolean })?.tutor === true)
    .reverse()
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: String(row.content || ''),
    }));

  if (rows.length) memoryBySession.set(chatSessionId, rows);
  return rows;
}

async function nextTurnNumber(sessionId: string, userId: string): Promise<number> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from(HINA_MESSAGES)
    .select('turn_number')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('turn_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.turn_number || 0) + 1;
}

function preview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 180 ? `${t.slice(0, 177)}…` : t;
}

export async function persistTutorExchange(
  userId: string,
  chatSessionId: string,
  userContent: string,
  assistantContent: string,
  source: TutorAskSource,
  extraMetadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  let turn = await nextTurnNumber(chatSessionId, userId);
  const baseMeta = {
    source: 'chrome_extension',
    tutor: true,
    ask_source: source,
    platform: 'tutor',
    ...extraMetadata,
  };

  const rows = [
    {
      session_id: chatSessionId,
      user_id: userId,
      client_message_id: `ext:tutor:${chatSessionId}:u:${Date.now()}:${turn}`,
      role: 'user' as const,
      content: userContent,
      turn_number: turn,
      metadata: baseMeta,
    },
    {
      session_id: chatSessionId,
      user_id: userId,
      client_message_id: `ext:tutor:${chatSessionId}:a:${Date.now()}:${turn}`,
      role: 'assistant' as const,
      content: assistantContent,
      turn_number: turn + 1,
      metadata: { ...baseMeta, api: 'zenmux/openai/gpt-4o' },
    },
  ];

  const { error } = await supabase.from(HINA_MESSAGES).upsert(rows, {
    onConflict: 'session_id,client_message_id',
  });
  if (error) throw new Error(error.message);

  const { data: sessionRow } = await supabase
    .from(HINA_SESSIONS)
    .select('message_count')
    .eq('id', chatSessionId)
    .eq('user_id', userId)
    .maybeSingle();

  const messageCount = Number(sessionRow?.message_count || 0) + 2;

  await supabase
    .from(HINA_SESSIONS)
    .update({
      message_count: messageCount,
      last_preview: preview(assistantContent),
      updated_at: new Date().toISOString(),
    })
    .eq('id', chatSessionId)
    .eq('user_id', userId);

  appendMemory(chatSessionId, userContent, assistantContent);
}
