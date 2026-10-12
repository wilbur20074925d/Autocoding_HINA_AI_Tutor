import { supabase } from '../lib/supabase';

const SESSIONS = 'HINA_class_sessions';
const MEMBERS = 'HINA_class_session_members';

const SESSION_COLUMNS =
  'id, teacher_id, teacher_name, title, description, join_code, created_at, updated_at';

const MEMBER_COLUMNS =
  'id, session_id, student_id, student_name, student_email, joined_at';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface ClassSessionMember {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  joinedAt: string;
}

export interface ClassSession {
  id: string;
  teacherId: string;
  teacherName: string;
  title: string;
  description: string;
  joinCode: string;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  members: ClassSessionMember[];
}

interface SessionRow {
  id: string;
  teacher_id: string;
  teacher_name: string | null;
  title: string;
  description: string | null;
  join_code: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  joined_at: string;
}

function db() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  return supabase;
}

export function generateJoinCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function explainError(error: { message?: string; code?: string } | null, fallback: string): string {
  const message = error?.message || fallback;
  if (/schema cache|PGRST205|could not find the (table|function)/i.test(message)) {
    return 'Session storage is not ready yet. Apply the class-sessions database migration, then refresh.';
  }
  if (error?.code === '23505' || /duplicate key|join_code/i.test(message)) {
    return 'That code is already in use. Generate a new one and save again.';
  }
  if (error?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'You do not have permission to change this session.';
  }
  return message;
}

function mapMember(row: MemberRow): ClassSessionMember {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    studentName: row.student_name || 'Student',
    studentEmail: row.student_email || '',
    joinedAt: row.joined_at,
  };
}

function mapSession(row: SessionRow, members: ClassSessionMember[] = [], joinedAt?: string): ClassSession {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name || 'Teacher',
    title: row.title,
    description: row.description || '',
    joinCode: row.join_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    joinedAt,
    members,
  };
}

async function membersFor(sessionIds: string[]): Promise<Map<string, ClassSessionMember[]>> {
  const grouped = new Map<string, ClassSessionMember[]>();
  if (sessionIds.length === 0) return grouped;

  const { data, error } = await db()
    .from(MEMBERS)
    .select(MEMBER_COLUMNS)
    .in('session_id', sessionIds)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(explainError(error, 'Could not load session members.'));

  ((data || []) as MemberRow[]).forEach((row) => {
    const member = mapMember(row);
    const list = grouped.get(member.sessionId) || [];
    list.push(member);
    grouped.set(member.sessionId, list);
  });
  return grouped;
}

export const ClassSessionService = {
  async listForTeacher(teacherId: string): Promise<ClassSession[]> {
    const { data, error } = await db()
      .from(SESSIONS)
      .select(SESSION_COLUMNS)
      .eq('teacher_id', teacherId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(explainError(error, 'Could not load your sessions.'));

    const rows = (data || []) as SessionRow[];
    const members = await membersFor(rows.map((row) => row.id));
    return rows.map((row) => mapSession(row, members.get(row.id) || []));
  },

  async listForStudent(studentId: string): Promise<ClassSession[]> {
    const { data: memberships, error: memberError } = await db()
      .from(MEMBERS)
      .select(MEMBER_COLUMNS)
      .eq('student_id', studentId)
      .order('joined_at', { ascending: false });

    if (memberError) throw new Error(explainError(memberError, 'Could not load your sessions.'));

    const memberRows = (memberships || []) as MemberRow[];
    if (memberRows.length === 0) return [];

    const { data, error } = await db()
      .from(SESSIONS)
      .select(SESSION_COLUMNS)
      .in('id', memberRows.map((row) => row.session_id));

    if (error) throw new Error(explainError(error, 'Could not load your sessions.'));

    const byId = new Map(((data || []) as SessionRow[]).map((row) => [row.id, row]));
    return memberRows.flatMap((membership) => {
      const row = byId.get(membership.session_id);
      if (!row) return [];
      return [mapSession(row, [mapMember(membership)], membership.joined_at)];
    });
  },

  async create(input: {
    teacherId: string;
    teacherName: string;
    title: string;
    description: string;
    joinCode?: string;
  }): Promise<ClassSession> {
    const { data, error } = await db()
      .from(SESSIONS)
      .insert({
        teacher_id: input.teacherId,
        teacher_name: input.teacherName,
        title: input.title.trim(),
        description: input.description.trim(),
        join_code: input.joinCode || generateJoinCode(),
      })
      .select(SESSION_COLUMNS)
      .single();

    if (error || !data) throw new Error(explainError(error, 'Could not create the session.'));
    return mapSession(data as SessionRow);
  },

  async update(
    sessionId: string,
    input: { title: string; description: string; joinCode: string }
  ): Promise<ClassSession> {
    const { data, error } = await db()
      .from(SESSIONS)
      .update({
        title: input.title.trim(),
        description: input.description.trim(),
        join_code: normalizeJoinCode(input.joinCode),
      })
      .eq('id', sessionId)
      .select(SESSION_COLUMNS)
      .single();

    if (error || !data) throw new Error(explainError(error, 'Could not update the session.'));

    const members = await membersFor([sessionId]);
    return mapSession(data as SessionRow, members.get(sessionId) || []);
  },

  async remove(sessionId: string): Promise<void> {
    const { error } = await db().from(SESSIONS).delete().eq('id', sessionId);
    if (error) throw new Error(explainError(error, 'Could not delete the session.'));
  },

  async join(code: string): Promise<ClassSession> {
    const normalized = normalizeJoinCode(code);
    if (normalized.length < 4) {
      throw new Error('Enter the session code from your teacher.');
    }

    const { data, error } = await db().rpc('hina_join_class_session', { p_code: normalized });
    if (error || !data) throw new Error(explainError(error, 'Could not join that session.'));

    const row = data as SessionRow;
    return mapSession(row, [], new Date().toISOString());
  },

  async leave(sessionId: string, studentId: string): Promise<void> {
    const { error } = await db()
      .from(MEMBERS)
      .delete()
      .eq('session_id', sessionId)
      .eq('student_id', studentId);
    if (error) throw new Error(explainError(error, 'Could not leave the session.'));
  },
};
