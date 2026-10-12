import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Clock,
  Download,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import JSZip from 'jszip';
import type { User } from '../../lib/supabase';
import type { Course } from '../../types';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import {
  AITutorNewService,
  noteMessagesToRows,
  type AITutorNewMessage,
  type AITutorStaffSession,
} from '../../services/aiTutorNewService';
import { downloadBlob } from './exportAssignmentZip';
import { isStaffRole } from '../../utils/roles';
import { TeacherHinaAnalysis } from './TeacherHinaAnalysis';
import { DeleteSessionDialog } from '../shared/DeleteSessionDialog';

interface AITutorSessionsPageProps {
  currentUser: User;
  students: User[];
  course?: Course | null;
}

type SortKey = 'recent' | 'messages' | 'student';

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [headers, ...rows]
    .map((line) => line.map(escapeCsvCell).join(','))
    .join('\r\n');
}

function safeFilePart(value: string, fallback: string): string {
  const cleaned = value.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').slice(0, 60);
  return cleaned || fallback;
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Unknown';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildTranscript(
  session: AITutorStaffSession,
  messages: AITutorNewMessage[],
  courseLabel?: string | null
): string {
  const lines = [
    `AI Tutor Session`,
    `Title: ${session.title}`,
    `Student: ${session.user_name}${session.user_email ? ` <${session.user_email}>` : ''}`,
    `Student ID: ${session.user_id}`,
    courseLabel ? `Course: ${courseLabel}` : session.course_id ? `Course ID: ${session.course_id}` : '',
    `Started: ${formatDateTime(session.created_at)}`,
    `Updated: ${formatDateTime(session.updated_at)}`,
    `Messages: ${messages.length}`,
    '',
    '---',
    '',
  ].filter((line, index, arr) => line !== '' || arr[index - 1] !== '');

  if (messages.length === 0) {
    lines.push('No messages in this session.');
    return lines.join('\n');
  }

  messages.forEach((message) => {
    const speaker = message.role === 'user' ? 'Student' : 'AI Tutor';
    lines.push(`[${speaker}] ${formatDateTime(message.created_at)}`);
    lines.push(message.content || '');
    lines.push('');
  });

  return lines.join('\n').trim() + '\n';
}

export const AITutorSessionsPage: React.FC<AITutorSessionsPageProps> = ({
  currentUser,
  students,
  course = null,
}) => {
  const [sessions, setSessions] = useState<AITutorStaffSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentFilterIds, setStudentFilterIds] = useState<string[]>([]);
  const [studentMenuOpen, setStudentMenuOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AITutorNewMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingActive, setExportingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [showHinaAnalysis, setShowHinaAnalysis] = useState(false);
  const lastCheckedIndexRef = useRef<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const shiftKeyRef = useRef(false);
  const studentMenuRef = useRef<HTMLDivElement | null>(null);

  const rosterIds = useMemo(() => new Set(students.map((student) => student.id)), [students]);
  const courseLabel = course ? `${course.code} — ${course.name}` : null;
  const service = useMemo(() => AITutorNewService.getInstance(), []);
  const loadHinaNotes = useCallback((ids: string[]) => service.getStaffChatNotesByIds(ids), [service]);

  const fetchStaffSessions = useCallback(async () => {
    const rows = await service.getStaffChatSessions({
      courseId: course?.id,
      courseCode: course?.code,
      rosterUserIds: students.map((student) => student.id),
    });

    const scoped = rows.filter((session) => {
      if (course) {
        const matchesCourse = Boolean(
          session.course_id &&
            (session.course_id === course.id ||
              session.course_id === course.code ||
              session.course_id.toLowerCase() === course.id.toLowerCase() ||
              session.course_id.toLowerCase() === (course.code || '').toLowerCase())
        );
        if (matchesCourse) return true;
        return rosterIds.size > 0 && rosterIds.has(session.user_id) && !session.course_id;
      }
      if (rosterIds.size > 0) return rosterIds.has(session.user_id);
      return true;
    });

    return scoped.map((session) => {
      const rosterStudent = students.find((student) => student.id === session.user_id);
      if (!rosterStudent) return session;
      return {
        ...session,
        user_name: rosterStudent.name || session.user_name,
        user_email: rosterStudent.email || session.user_email,
      };
    });
  }, [course, rosterIds, service, students]);

  const applySessions = useCallback((withRosterNames: AITutorStaffSession[]) => {
    setSessions(withRosterNames);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => withRosterNames.some((session) => session.id === id)));
      return next;
    });
    setActiveSessionId((current) =>
      current && withRosterNames.some((session) => session.id === current)
        ? current
        : withRosterNames[0]?.id ?? null
    );
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySessions(await fetchStaffSessions());
    } catch (loadError) {
      console.error('Failed to load AI Tutor sessions:', loadError);
      setError('Could not load AI Tutor sessions. Please try again.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [applySessions, fetchStaffSessions]);

  /** Quiet refresh for live HINA — does not flash the sessions page spinner. */
  const refreshSessionsSilent = useCallback(async () => {
    try {
      applySessions(await fetchStaffSessions());
    } catch (loadError) {
      console.warn('Silent AI Tutor session refresh failed:', loadError);
    }
  }, [applySessions, fetchStaffSessions]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    service
      .getSessionMessages(activeSessionId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((messageError) => {
        console.error('Failed to load session messages:', messageError);
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, service]);

  const studentOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    sessions.forEach((session) => {
      if (!byId.has(session.user_id)) {
        byId.set(session.user_id, { id: session.user_id, name: session.user_name });
      }
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const visibleStudentOptions = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return studentOptions;
    return studentOptions.filter((student) => student.name.toLowerCase().includes(query));
  }, [studentOptions, studentQuery]);

  useEffect(() => {
    if (!studentMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!studentMenuRef.current?.contains(event.target as Node)) {
        setStudentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [studentMenuOpen]);

  const toggleStudentFilter = (studentId: string) => {
    setStudentFilterIds((prev) => {
      if (prev.length === 0) return [studentId];
      if (prev.includes(studentId)) return prev.filter((id) => id !== studentId);
      return [...prev, studentId];
    });
  };

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const next = sessions.filter((session) => {
      if (studentFilterIds.length > 0 && !studentFilterIds.includes(session.user_id)) return false;
      if (!query) return true;
      return (
        session.user_name.toLowerCase().includes(query) ||
        session.user_email.toLowerCase().includes(query) ||
        session.title.toLowerCase().includes(query) ||
        (session.last_preview || '').toLowerCase().includes(query)
      );
    });

    next.sort((a, b) => {
      if (sortKey === 'messages') return b.message_count - a.message_count;
      if (sortKey === 'student') return a.user_name.localeCompare(b.user_name) || b.updated_at.localeCompare(a.updated_at);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return next;
  }, [searchTerm, sessions, sortKey, studentFilterIds]);

  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredSessions.map((session) => session.user_id));
    const messageCount = filteredSessions.reduce((sum, session) => sum + session.message_count, 0);
    const latest = filteredSessions[0]?.updated_at;
    return {
      sessions: filteredSessions.length,
      students: uniqueStudents.size,
      messages: messageCount,
      latest: latest ? formatRelativeTime(latest) : '—',
    };
  }, [filteredSessions]);

  const activeSession = filteredSessions.find((session) => session.id === activeSessionId) ||
    sessions.find((session) => session.id === activeSessionId) ||
    null;

  const allFilteredSelected =
    filteredSessions.length > 0 && filteredSessions.every((session) => selectedIds.has(session.id));
  const someFilteredSelected = filteredSessions.some((session) => selectedIds.has(session.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [allFilteredSelected, someFilteredSelected]);

  const toggleSelectFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredSessions.forEach((session) => next.delete(session.id));
        return next;
      }
      const next = new Set(prev);
      filteredSessions.forEach((session) => next.add(session.id));
      return next;
    });
  };

  const toggleSelected = (sessionId: string, shiftKey = false) => {
    const index = filteredSessions.findIndex((session) => session.id === sessionId);
    if (shiftKey && lastCheckedIndexRef.current != null && index >= 0) {
      const start = Math.min(lastCheckedIndexRef.current, index);
      const end = Math.max(lastCheckedIndexRef.current, index);
      const rangeIds = filteredSessions.slice(start, end + 1).map((session) => session.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(sessionId)) next.delete(sessionId);
        else next.add(sessionId);
        return next;
      });
    }
    if (index >= 0) lastCheckedIndexRef.current = index;
  };

  const exportSessions = useCallback(
    async (ids: string[], filenamePrefix: string) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        setError('Select at least one session to export.');
        return;
      }

      setError(null);
      const notes = await service.getStaffChatNotesByIds(uniqueIds);
      const notesById = new Map(notes.map((note) => [note.id, note]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));

      const sessionRows: Array<Array<string | number | null | undefined>> = [];
      const messageRows: Array<Array<string | number | null | undefined>> = [];
      const zip = new JSZip();
      const transcripts = zip.folder('transcripts');

      uniqueIds.forEach((id) => {
        const session = sessionById.get(id);
        if (!session) return;
        const note = notesById.get(id);
        const sessionMessages = note ? noteMessagesToRows(note) : [];
        sessionRows.push([
          session.id,
          session.user_id,
          session.user_name,
          session.user_email,
          session.title,
          session.course_id || course?.code || course?.id || '',
          sessionMessages.length || session.message_count,
          session.created_at,
          session.updated_at,
          session.last_preview || '',
        ]);
        sessionMessages.forEach((message, index) => {
          messageRows.push([
            session.id,
            session.user_id,
            session.user_name,
            session.user_email,
            session.title,
            message.turn_number || index + 1,
            message.role,
            message.content,
            message.created_at,
          ]);
        });
        const fileName = `${safeFilePart(session.user_name, 'student')}_${safeFilePart(session.title, 'session')}_${session.id.slice(0, 8)}.txt`;
        transcripts?.file(fileName, buildTranscript(session, sessionMessages, courseLabel));
      });

      zip.file(
        'sessions.csv',
        `\uFEFF${toCsv(
          [
            'session_id',
            'student_id',
            'student_name',
            'student_email',
            'title',
            'course_id',
            'message_count',
            'created_at',
            'updated_at',
            'last_preview',
          ],
          sessionRows
        )}`
      );
      zip.file(
        'messages.csv',
        `\uFEFF${toCsv(
          [
            'session_id',
            'student_id',
            'student_name',
            'student_email',
            'session_title',
            'turn_number',
            'role',
            'content',
            'created_at',
          ],
          messageRows
        )}`
      );

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const coursePart = course?.code ? `${safeFilePart(course.code, 'course')}_` : '';
      downloadBlob(blob, `${filenamePrefix}_${coursePart}${stamp}.zip`);
    },
    [course?.code, course?.id, courseLabel, service, sessions]
  );

  const handleExportSelectedOrFiltered = async () => {
    const ids = selectedIds.size > 0
      ? [...selectedIds]
      : filteredSessions.map((session) => session.id);
    if (ids.length === 0) {
      setError('There are no sessions to export.');
      return;
    }
    setExporting(true);
    try {
      await exportSessions(ids, selectedIds.size > 0 ? 'ai_tutor_selected_sessions' : 'ai_tutor_sessions');
    } catch (exportError) {
      console.error('Failed to export AI Tutor sessions:', exportError);
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportActive = async () => {
    if (!activeSession) return;
    setExportingActive(true);
    try {
      await exportSessions([activeSession.id], `ai_tutor_${safeFilePart(activeSession.user_name, 'student')}`);
    } catch (exportError) {
      console.error('Failed to export AI Tutor session:', exportError);
      setError('Could not export this conversation.');
    } finally {
      setExportingActive(false);
    }
  };

  const pendingDeleteSessions = useMemo(
    () => sessions.filter((session) => pendingDeleteIds.includes(session.id)),
    [pendingDeleteIds, sessions]
  );

  const requestDeleteSessions = (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) {
      setError('Select at least one session to delete.');
      return;
    }
    setError(null);
    setPendingDeleteIds(unique);
  };

  const handleDeleteConfirm = async () => {
    const ids = pendingDeleteIds;
    if (ids.length === 0) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await service.deleteStaffSessions(ids);
      if (result.deleted === 0) {
        setError('Could not delete the selected session(s). Please try again.');
        return;
      }

      const removed = new Set(ids);
      const remaining = sessions.filter((session) => !removed.has(session.id));
      setSessions(remaining);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (activeSessionId && removed.has(activeSessionId)) {
        setActiveSessionId(remaining[0]?.id ?? null);
        setMessages([]);
      }
      setPendingDeleteIds([]);
      if (result.failed > 0) {
        setError(`${result.deleted} session(s) deleted. ${result.failed} could not be removed.`);
      }
    } catch (deleteError) {
      console.error('Failed to delete AI Tutor sessions:', deleteError);
      setError('Could not delete the selected session(s). Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (!isStaffRole(currentUser.role)) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm animate-fade-in-up sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="mb-1 text-xl font-bold tracking-tight text-slate-900">AI Tutor</h1>
            <p className="text-sm font-medium tracking-tight text-slate-600">
              Review student conversations with the AI Tutor and export session transcripts.
            </p>
            {courseLabel && (
              <p className="mt-1 text-xs font-semibold tracking-tight text-slate-500">{courseLabel}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowHinaAnalysis(true)}
              disabled={filteredSessions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
              <Network className="h-4 w-4" />
              HINA
            </button>
            <button
              type="button"
              onClick={() => void handleExportSelectedOrFiltered()}
              disabled={exporting || (selectedIds.size === 0 && filteredSessions.length === 0)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold tracking-tight text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {selectedIds.size > 0 ? `Export selected (${selectedIds.size})` : 'Export sessions'}
            </button>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[
            { icon: MessageSquare, label: 'Sessions', value: stats.sessions.toLocaleString() },
            { icon: Users, label: 'Students', value: stats.students.toLocaleString() },
            { icon: Bot, label: 'Messages', value: stats.messages.toLocaleString() },
            { icon: Clock, label: 'Latest', value: stats.latest },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2.5 px-3 py-2">
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
                  <dd className="truncate text-sm font-bold tracking-tight text-slate-900">{item.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-slate-700" />
          <span className="text-sm font-medium tracking-tight">{error}</span>
        </div>
      )}

      <div className="grid min-h-[32rem] grid-cols-1 gap-4 xl:h-[calc(100vh-12rem)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-1.5 border-b border-slate-200 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search"
                  className="w-full rounded-md border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs font-medium tracking-tight text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div className="relative shrink-0" ref={studentMenuRef}>
                <button
                  type="button"
                  onClick={() => setStudentMenuOpen((open) => !open)}
                  className="inline-flex max-w-[9.5rem] items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium tracking-tight text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  title="Filter by students"
                  aria-expanded={studentMenuOpen}
                >
                  <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">
                    {studentFilterIds.length === 0
                      ? 'All students'
                      : studentFilterIds.length === 1
                        ? studentOptions.find((student) => student.id === studentFilterIds[0])?.name || '1 student'
                        : `${studentFilterIds.length} students`}
                  </span>
                </button>
                {studentMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {studentFilterIds.length === 0 ? 'All students' : `${studentFilterIds.length} selected`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setStudentFilterIds([])}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-tight text-slate-600 transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                      >
                        All
                      </button>
                    </div>
                    <div className="border-b border-slate-200 p-2">
                      <input
                        type="search"
                        value={studentQuery}
                        onChange={(event) => setStudentQuery(event.target.value)}
                        placeholder="Search students"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium tracking-tight text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                      />
                    </div>
                    {studentFilterIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-2">
                        {studentOptions
                          .filter((student) => studentFilterIds.includes(student.id))
                          .map((student) => (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => toggleStudentFilter(student.id)}
                              className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-700"
                            >
                              <span className="truncate">{student.name}</span>
                              <X className="h-3 w-3 shrink-0 opacity-80" />
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="max-h-52 overflow-y-auto">
                      {visibleStudentOptions.length === 0 ? (
                        <p className="px-3 py-4 text-center text-[11px] font-medium text-slate-500">No matching students.</p>
                      ) : (
                        visibleStudentOptions.map((student) => {
                          const picked = studentFilterIds.includes(student.id);
                          return (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => toggleStudentFilter(student.id)}
                              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs font-semibold tracking-tight transition-colors ${
                                picked
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-800 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              <span className="truncate">{student.name}</span>
                              <span className={`h-3.5 w-3.5 shrink-0 rounded border ${picked || studentFilterIds.length === 0 ? 'border-current bg-current' : 'border-slate-300'}`} />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="w-[7rem] shrink-0 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium tracking-tight text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                title="Sort sessions"
              >
                <option value="recent">Most recent</option>
                <option value="messages">Most messages</option>
                <option value="student">Student name</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-700">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  disabled={filteredSessions.length === 0}
                  onChange={toggleSelectFiltered}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                />
                <span className="truncate">
                  {allFilteredSelected ? 'Clear all' : 'Select all'}
                  {selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}
                </span>
              </label>
              <button
                type="button"
                onClick={() => requestDeleteSessions([...selectedIds])}
                disabled={deleting || selectedIds.size === 0}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold tracking-tight text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-600">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                <p className="text-sm font-medium tracking-tight">Loading AI Tutor sessions…</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <p className="text-sm font-semibold tracking-tight text-slate-700">No AI Tutor sessions yet</p>
                <p className="mt-1 text-xs font-medium tracking-tight text-slate-500">
                  Conversations will appear here after students chat with the AI Tutor.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isChecked = selectedIds.has(session.id);
                  return (
                    <li key={session.id}>
                      <div
                        className={`flex items-start gap-2 px-3 py-3 transition ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : isChecked
                              ? 'bg-slate-100'
                              : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <label className="mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(event) => {
                              event.stopPropagation();
                              shiftKeyRef.current = event.shiftKey;
                            }}
                            onChange={() => toggleSelected(session.id, shiftKeyRef.current)}
                            className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                            aria-label={isChecked ? `Deselect ${session.user_name}` : `Select ${session.user_name}`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setActiveSessionId(session.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isActive ? 'bg-white/15 text-white' : 'bg-slate-800 text-white'
                              }`}
                            >
                              {initials(session.user_name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`truncate text-sm font-bold tracking-tight ${isActive ? 'text-white' : 'text-slate-900'}`}>
                                  {session.user_name}
                                </p>
                                <span className={`shrink-0 text-[11px] font-semibold ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                  {formatRelativeTime(session.updated_at)}
                                </span>
                              </div>
                              <p className={`truncate text-xs font-medium ${isActive ? 'text-slate-200' : 'text-slate-600'}`}>
                                {session.title}
                              </p>
                              <p className={`mt-1 line-clamp-2 text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                {session.last_preview || 'No preview yet'}
                              </p>
                              <span
                                className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {session.message_count} {session.message_count === 1 ? 'message' : 'messages'}
                              </span>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteSessions([session.id])}
                          disabled={deleting}
                          className={`mt-1 rounded-lg p-1.5 transition ${
                            isActive
                              ? 'text-white/80 hover:bg-white/10 hover:text-white'
                              : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                          }`}
                          aria-label={`Delete session with ${session.user_name}`}
                          title="Delete session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {!activeSession ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <MessageSquare className="h-7 w-7 text-white" />
              </div>
              <p className="text-base font-semibold tracking-tight text-slate-800">Select a session</p>
              <p className="mt-1 max-w-sm text-sm font-medium tracking-tight text-slate-500">
                Choose a student conversation on the left to read the full AI Tutor transcript.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
                  {initials(activeSession.user_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                    {activeSession.user_name}
                    {activeSession.user_email ? (
                      <span className="ml-1.5 font-medium text-slate-500">{activeSession.user_email}</span>
                    ) : null}
                  </h2>
                  <p className="truncate text-xs font-medium tracking-tight text-slate-500">
                    {activeSession.title}
                    {' · '}
                    {messages.length || activeSession.message_count} messages
                    {' · '}
                    {formatRelativeTime(activeSession.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleExportActive()}
                    disabled={exportingActive}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold tracking-tight text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                    title="Export this session"
                  >
                    {exportingActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteSessions([activeSession.id])}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold tracking-tight text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    title="Delete this session"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5">
                {loadingMessages ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-600">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                    <p className="text-sm font-medium tracking-tight">Loading conversation…</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
                    <p className="text-sm font-semibold tracking-tight text-slate-700">No messages in this session</p>
                    <p className="mt-1 text-xs font-medium tracking-tight text-slate-500">
                      The student may have opened AI Tutor without sending a message.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const isUser = message.role === 'user';
                      return (
                        <article
                          key={message.id}
                          className={`flex gap-3 ${isUser ? 'flex-row' : 'flex-row'}`}
                        >
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              isUser ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'
                            }`}
                          >
                            {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-xs font-bold tracking-tight text-slate-800">
                                {isUser ? activeSession.user_name : 'AI Tutor'}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">
                                {formatDateTime(message.created_at)}
                              </span>
                            </div>
                            <div
                              className={`rounded-2xl border px-4 py-3 shadow-sm ${
                                isUser
                                  ? 'border-slate-800 bg-slate-800 text-white'
                                  : 'border-slate-200 bg-white text-slate-800'
                              }`}
                            >
                              {isUser ? (
                                <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed tracking-tight text-white">
                                  {message.content}
                                </p>
                              ) : (
                                <MarkdownRenderer content={message.content} variant="chat" className="text-sm" />
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {pendingDeleteIds.length > 0 && (
        <DeleteSessionDialog
          sessionTitle={
            pendingDeleteIds.length === 1
              ? pendingDeleteSessions[0]?.title || 'AI Tutor session'
              : `${pendingDeleteIds.length} sessions`
          }
          description={
            pendingDeleteIds.length === 1
              ? `This permanently removes ${pendingDeleteSessions[0]?.user_name || 'this student'}'s conversation. This cannot be undone.`
              : 'The selected AI Tutor conversations will be permanently removed. This cannot be undone.'
          }
          busy={deleting}
          onConfirm={() => void handleDeleteConfirm()}
          onDismiss={() => {
            if (!deleting) setPendingDeleteIds([]);
          }}
        />
      )}

      {showHinaAnalysis && (
        <TeacherHinaAnalysis
          sessions={filteredSessions}
          selectedIds={selectedIds}
          courseLabel={courseLabel}
          loadNotes={loadHinaNotes}
          onRefreshSessions={refreshSessionsSilent}
          onClose={() => setShowHinaAnalysis(false)}
        />
      )}
    </div>
  );
};
