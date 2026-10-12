export const STUDENT_STREAM_PAGES = [
  'coursework',
  'coding-playground',
  'ai-tutor',
  'collaboration',
  'innovation-space',
  'progress',
  'ethics',
  'mailbox',
  'profile',
  'settings',
  'staff',
  'other',
] as const;

export type StudentStreamPage = (typeof STUDENT_STREAM_PAGES)[number];

export const STUDENT_INTERACTIONS = [
  'click',
  'dblclick',
  'rightclick',
  'keyboard',
  'type',
  'paste',
  'cut',
  'drag',
  'drop',
  'scroll',
  'touch',
  'ai',
  'remote',
  'system',
] as const;

export type StudentInteraction = (typeof STUDENT_INTERACTIONS)[number];

export const DWELL_START_REASONS = ['enter', 'resume', 'visible_activity'] as const;
export const DWELL_END_REASONS = ['leave', 'idle', 'hidden', 'session_end', 'heartbeat_timeout'] as const;

export type DwellStartReason = (typeof DWELL_START_REASONS)[number];
export type DwellEndReason = (typeof DWELL_END_REASONS)[number];

export interface StudentActionEvent {
  id: string;
  occurred_at: string;
  student_id: string;
  session_id: string;
  course_id?: string | null;
  parent_page: StudentStreamPage | string;
  subpage?: string | null;
  route?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  target_id?: string | null;
  target_label?: string | null;
  action: string;
  interaction?: StudentInteraction | string | null;
  summary?: string | null;
  content_preview?: string | null;
  content_before_preview?: string | null;
  chars_added?: number;
  chars_removed?: number;
  payload_path?: string | null;
  tape_path?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StudentPageDwell {
  id: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  student_id: string;
  session_id: string;
  course_id?: string | null;
  parent_page: StudentStreamPage | string;
  subpage?: string | null;
  route?: string | null;
  start_reason: DwellStartReason | string;
  end_reason?: DwellEndReason | string | null;
  last_activity_at: string;
  last_heartbeat_at: string;
  metadata?: Record<string, unknown>;
}

export interface StudentActivitySessionRow {
  id: string;
  student_id: string;
  course_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  last_page?: string | null;
  last_activity_at: string;
  device?: Record<string, unknown>;
}

export interface StudentActionDailyRow {
  student_id: string;
  course_id: string;
  day: string;
  parent_page: string;
  action: string;
  event_count: number;
  chars_added: number;
  chars_removed: number;
}

export interface TrackActionInput {
  action: string;
  interaction?: StudentInteraction | string;
  summary?: string;
  entityType?: string | null;
  entityId?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  contentBefore?: string | null;
  contentAfter?: string | null;
  charsAdded?: number;
  charsRemoved?: number;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface StudentActionIngestPayload {
  session?: Partial<StudentActivitySessionRow> | null;
  actions?: StudentActionEvent[];
  dwells?: StudentPageDwell[];
}
