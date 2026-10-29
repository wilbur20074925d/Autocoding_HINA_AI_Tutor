import { getSupabase } from '../lib/supabase';

const HINA_SESSIONS = 'HINA_chat_sessions';

export interface ChatSessionRow {
  id: string;
  title: string;
  courseId: string | null;
  messageCount: number;
  lastPreview: string | null;
  updatedAt: string;
}

function courseScopeKeys(courseId?: string | null, courseCode?: string | null): string[] {
  const keys = new Set<string>();
  if (courseId) keys.add(courseId);
  if (courseCode) {
    keys.add(courseCode);
    keys.add(courseCode.toUpperCase());
    keys.add(courseCode.toLowerCase());
  }
  return [...keys];
}

export async function listChatSessions(
  userId: string,
  courseId?: string | null,
  courseCode?: string | null
): Promise<ChatSessionRow[]> {
  const supabase = getSupabase();
  const courseKeys = courseScopeKeys(courseId, courseCode);

  let query = supabase
    .from(HINA_SESSIONS)
    .select('id, title, course_id, message_count, last_preview, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (courseKeys.length > 0) {
    query = query.in('course_id', courseKeys);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || 'Chat',
    courseId: (row.course_id as string) || null,
    messageCount: Number(row.message_count || 0),
    lastPreview: (row.last_preview as string) || null,
    updatedAt: (row.updated_at as string) || '',
  }));
}

export async function createChatSession(userId: string, title: string, courseId: string): Promise<ChatSessionRow> {
  const supabase = getSupabase();
  const { data: roleRow } = await supabase.from('HINA_users').select('role').eq('id', userId).maybeSingle();
  const ownerRole = String(roleRow?.role || 'student').toLowerCase() || 'student';

  const { data, error } = await supabase
    .from(HINA_SESSIONS)
    .insert({
      user_id: userId,
      owner_role: ownerRole,
      course_id: courseId,
      title: title.trim() || 'External AI chat',
      message_count: 0,
      is_active: true,
    })
    .select('id, title, course_id, message_count, last_preview, updated_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'Could not create chat session.');

  return {
    id: data.id as string,
    title: (data.title as string) || title,
    courseId: (data.course_id as string) || courseId,
    messageCount: 0,
    lastPreview: null,
    updatedAt: (data.updated_at as string) || new Date().toISOString(),
  };
}

export async function loadChatMessages(sessionId: string, userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('HINA_chat_messages')
    .select('client_message_id, role, content, turn_number, created_at, metadata')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('turn_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row, index) => ({
    id: String(row.client_message_id || `msg-${index}`),
    role: row.role as 'user' | 'assistant',
    content: String(row.content || ''),
    turnNumber: Number(row.turn_number || index + 1),
  }));
}
