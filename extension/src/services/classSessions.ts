import { getSupabase } from '../lib/supabase';

const SESSIONS = 'HINA_class_sessions';
const MEMBERS = 'HINA_class_session_members';

export interface ClassSessionRow {
  id: string;
  title: string;
  description: string;
  joinCode: string;
  joinedAt?: string;
}

function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export async function listClassSessionsForStudent(studentId: string): Promise<ClassSessionRow[]> {
  const supabase = getSupabase();
  const { data: memberships, error: memberError } = await supabase
    .from(MEMBERS)
    .select('session_id, joined_at')
    .eq('student_id', studentId)
    .order('joined_at', { ascending: false });

  if (memberError) throw new Error(memberError.message);
  const memberRows = memberships || [];
  if (memberRows.length === 0) return [];

  const sessionIds = memberRows.map((m) => m.session_id as string);
  const { data, error } = await supabase
    .from(SESSIONS)
    .select('id, title, description, join_code')
    .in('id', sessionIds);

  if (error) throw new Error(error.message);

  const byId = new Map((data || []).map((row) => [row.id as string, row]));
  return memberRows.flatMap((membership) => {
    const row = byId.get(membership.session_id as string);
    if (!row) return [];
    return [
      {
        id: row.id as string,
        title: (row.title as string) || 'Session',
        description: (row.description as string) || '',
        joinCode: (row.join_code as string) || '',
        joinedAt: membership.joined_at as string,
      },
    ];
  });
}

export async function joinClassSession(code: string): Promise<ClassSessionRow> {
  const supabase = getSupabase();
  const normalized = normalizeJoinCode(code);
  if (normalized.length < 4) {
    throw new Error('Enter a valid session code from your teacher.');
  }
  const { data, error } = await supabase.rpc('hina_join_class_session', { p_code: normalized });
  if (error || !data) throw new Error(error?.message || 'Could not join session.');
  const row = data as { id: string; title: string; description?: string; join_code: string };
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    joinCode: row.join_code,
    joinedAt: new Date().toISOString(),
  };
}
