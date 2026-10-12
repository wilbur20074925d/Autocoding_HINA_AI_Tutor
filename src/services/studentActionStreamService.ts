import { supabase } from '../lib/supabase';
import type {
  StudentActionDailyRow,
  StudentActionEvent,
  StudentActionIngestPayload,
  StudentPageDwell,
} from '../types/studentActionStream';

const NIL_COURSE = '00000000-0000-0000-0000-000000000000';

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class StudentActionStreamService {
  static async ingest(payload: StudentActionIngestPayload): Promise<{ error: unknown }> {
    if (!supabase) return { error: new Error('Supabase client is not available') };
    if (!payload.actions?.length && !payload.dwells?.length && !payload.session) {
      return { error: null };
    }

    const { error } = await supabase.rpc('ingest_student_activity', { payload });
    if (error) {
      console.error('[StudentActionStream] ingest failed:', error);
    }
    return { error };
  }

  static async uploadJson(
    _bucket: 'activity-tapes' | 'activity-payloads',
    _path: string,
    _body: string,
    _contentType = 'application/json'
  ): Promise<{ path: string | null; error: unknown }> {
    // Client storage uploads to activity-tapes / activity-payloads return HTTP 400
    // for students: INSERT … RETURNING * evaluates SELECT policies that still touch
    // public.users on this project. Events are already persisted via
    // ingest_student_activity, so skip the storage POST entirely.
    // Re-enable after 20260930010000_fix_activity_storage_users_permission.sql
    // is confirmed applied and student uploads succeed in the dashboard.
    return { path: null, error: null };
  }

  static async downloadPayload(path: string): Promise<{ data: unknown; error: unknown }> {
    if (!supabase) return { data: null, error: new Error('Supabase client is not available') };
    const { data, error } = await supabase.storage.from('activity-payloads').download(path);
    if (error || !data) return { data: null, error };
    try {
      const text = await data.text();
      return { data: JSON.parse(text), error: null };
    } catch (parseError) {
      return { data: null, error: parseError };
    }
  }

  static async listActions(options: {
    studentIds: string[];
    from: string;
    to: string;
    parentPage?: string | null;
    action?: string | null;
    search?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ data: StudentActionEvent[]; error: unknown }> {
    if (!supabase) return { data: [], error: new Error('Supabase client is not available') };
    if (!options.studentIds.length) return { data: [], error: null };

    let query = supabase
      .from('student_actions')
      .select('*')
      .in('student_id', options.studentIds)
      .gte('occurred_at', options.from)
      .lte('occurred_at', options.to)
      .order('occurred_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (options.parentPage) query = query.eq('parent_page', options.parentPage);
    if (options.action) query = query.eq('action', options.action);
    if (options.cursor) query = query.lt('occurred_at', options.cursor);
    if (options.search) {
      const term = `%${options.search}%`;
      query = query.or(
        `summary.ilike.${term},target_label.ilike.${term},content_preview.ilike.${term},action.ilike.${term}`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[StudentActionStream] listActions failed:', error);
      return { data: [], error };
    }
    return { data: (data || []) as StudentActionEvent[], error: null };
  }

  static async listDwells(options: {
    studentIds: string[];
    from: string;
    to: string;
    parentPage?: string | null;
  }): Promise<{ data: StudentPageDwell[]; error: unknown }> {
    if (!supabase) return { data: [], error: new Error('Supabase client is not available') };
    if (!options.studentIds.length) return { data: [], error: null };

    let query = supabase
      .from('student_page_dwells')
      .select('*')
      .in('student_id', options.studentIds)
      .gte('started_at', options.from)
      .lte('started_at', options.to)
      .order('started_at', { ascending: false })
      .limit(500);

    if (options.parentPage) query = query.eq('parent_page', options.parentPage);

    const { data, error } = await query;
    if (error) {
      console.error('[StudentActionStream] listDwells failed:', error);
      return { data: [], error };
    }
    return { data: (data || []) as StudentPageDwell[], error: null };
  }

  static async listDaily(options: {
    studentIds: string[];
    fromDay: string;
    toDay: string;
    courseId?: string | null;
  }): Promise<{ data: StudentActionDailyRow[]; error: unknown }> {
    if (!supabase) return { data: [], error: new Error('Supabase client is not available') };
    if (!options.studentIds.length) return { data: [], error: null };

    let query = supabase
      .from('student_action_daily')
      .select('*')
      .in('student_id', options.studentIds)
      .gte('day', options.fromDay)
      .lte('day', options.toDay);

    if (options.courseId) {
      query = query.in('course_id', [options.courseId, NIL_COURSE]);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[StudentActionStream] listDaily failed:', error);
      return { data: [], error };
    }
    return { data: (data || []) as StudentActionDailyRow[], error: null };
  }

  static async closeStaleDwells(studentId: string): Promise<void> {
    if (!supabase || !studentId) return;
    const { data, error } = await supabase
      .from('student_page_dwells')
      .select('*')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .limit(20);
    if (error || !data?.length) return;

    const dwells = data.map((row) => ({
      ...row,
      ended_at: row.last_heartbeat_at || row.last_activity_at || row.started_at,
      end_reason: 'heartbeat_timeout',
    })) as StudentPageDwell[];

    await this.ingest({ dwells });
  }

  static async listSessions(options: {
    studentIds: string[];
    from: string;
    to: string;
  }): Promise<{ data: Array<{ id: string; student_id: string; started_at: string; ended_at: string | null; last_page: string | null }>; error: unknown }> {
    if (!supabase) return { data: [], error: new Error('Supabase client is not available') };
    if (!options.studentIds.length) return { data: [], error: null };

    const { data, error } = await supabase
      .from('student_activity_sessions')
      .select('id, student_id, started_at, ended_at, last_page')
      .in('student_id', options.studentIds)
      .gte('started_at', options.from)
      .lte('started_at', options.to)
      .order('started_at', { ascending: false })
      .limit(40);

    if (error) {
      console.error('[StudentActionStream] listSessions failed:', error);
      return { data: [], error };
    }
    return { data: data || [], error: null };
  }

  static async downloadTape(path: string): Promise<{ text: string | null; error: unknown }> {
    if (!supabase) return { text: null, error: new Error('Supabase client is not available') };
    const { data, error } = await supabase.storage.from('activity-tapes').download(path);
    if (error || !data) return { text: null, error };
    return { text: await data.text(), error: null };
  }

  static dateWindow(preset: 'today' | '7d' | '30d', now = new Date()): { from: string; to: string; fromDay: string; toDay: string } {
    const to = now;
    const from = new Date(now);
    if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (preset === '7d') {
      from.setDate(from.getDate() - 7);
    } else {
      from.setDate(from.getDate() - 30);
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      fromDay: toDateKey(from),
      toDay: toDateKey(to),
    };
  }
}
