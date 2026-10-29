import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import type { User } from '../../lib/supabase';
import {
  ClassSessionService,
  generateJoinCode,
  normalizeJoinCode,
  type ClassSession,
} from '../../services/classSessionService';
import { isStaffRole } from '../../utils/roles';
import { DeleteSessionDialog } from '../shared/DeleteSessionDialog';

interface SessionDashboardProps {
  currentUser: User;
  onOpen: (session: ClassSession) => void;
}

interface Draft {
  title: string;
  description: string;
  joinCode: string;
}

function formatWhen(iso?: string): string {
  if (!iso) return 'Unknown';
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

function emptyDraft(): Draft {
  return { title: '', description: '', joinCode: generateJoinCode() };
}

export function SessionDashboard({ currentUser, onOpen }: SessionDashboardProps) {
  const staff = isStaffRole(currentUser.role);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; sessionId?: string; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClassSession | null>(null);
  const [pendingLeave, setPendingLeave] = useState<ClassSession | null>(null);
  const [removing, setRemoving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    setError(null);
    try {
      const rows = staff
        ? await ClassSessionService.listForTeacher(currentUser.id)
        : await ClassSessionService.listForStudent(currentUser.id);
      setSessions(rows);
    } catch (loadError) {
      if (!options?.quiet) setSessions([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load sessions.');
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [currentUser.id, staff]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) =>
      [session.title, session.description, session.joinCode, session.teacherName]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [query, sessions]);

  const copyCode = async (session: ClassSession) => {
    try {
      await navigator.clipboard.writeText(session.joinCode);
      setCopiedId(session.id);
      window.setTimeout(() => setCopiedId((current) => (current === session.id ? null : current)), 1600);
    } catch {
      setError('Could not copy the code. Select it and copy it manually.');
    }
  };

  const submitJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setError(null);
    setNotice(null);
    try {
      const joined = await ClassSessionService.join(joinCode);
      setJoinCode('');
      setNotice(`Joined “${joined.title}”. Open it when you are ready to start.`);
      await load({ quiet: true });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join that session.');
    } finally {
      setJoining(false);
    }
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const title = editor.draft.title.trim();
    if (!title) {
      setEditorError('Give the session a title.');
      return;
    }
    const code = normalizeJoinCode(editor.draft.joinCode);
    if (code.length < 4) {
      setEditorError('The join code needs at least 4 characters.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    try {
      if (editor.mode === 'create') {
        await ClassSessionService.create({
          teacherId: currentUser.id,
          teacherName: currentUser.name || currentUser.email,
          title,
          description: editor.draft.description,
          joinCode: code,
        });
      } else if (editor.sessionId) {
        await ClassSessionService.update(editor.sessionId, {
          title,
          description: editor.draft.description,
          joinCode: code,
        });
      }
      setEditor(null);
      await load({ quiet: true });
    } catch (saveError) {
      setEditorError(saveError instanceof Error ? saveError.message : 'Could not save the session.');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    const target = pendingDelete || pendingLeave;
    if (!target) return;
    setRemoving(true);
    setError(null);
    try {
      if (pendingDelete) await ClassSessionService.remove(target.id);
      else await ClassSessionService.leave(target.id, currentUser.id);
      setPendingDelete(null);
      setPendingLeave(null);
      await load({ quiet: true });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not update the session.');
      setPendingDelete(null);
      setPendingLeave(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Sessions</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {staff
                ? 'Create a session for each class or activity. Students join with the code, then their tutor conversations stay with that session.'
                : 'Enter the code from your teacher to join a session. Open a session when you are ready to work with the tutor.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {staff && (
              <button
                type="button"
                onClick={() => {
                  setEditorError(null);
                  setEditor({ mode: 'create', draft: emptyDraft() });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
              >
                <Plus className="h-4 w-4" />
                New session
              </button>
            )}
          </div>
        </div>

        {!staff && (
          <form onSubmit={(event) => void submitJoin(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Session code</span>
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(normalizeJoinCode(event.target.value))}
                placeholder="Enter session code"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 font-mono text-base font-semibold uppercase tracking-[0.28em] text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </label>
            <button
              type="submit"
              disabled={joining || joinCode.length < 4}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
            >
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Join session
            </button>
          </form>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-white p-3 text-slate-800">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-sm font-medium">{notice}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="relative min-w-0 max-w-sm flex-1">
          <span className="sr-only">Search sessions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </label>
        <p className="text-sm font-medium text-slate-500">
          {loading ? 'Loading…' : `${visible.length} session${visible.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="mb-2 h-5 w-5 animate-spin" />
          Loading sessions
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            {sessions.length === 0 ? 'No sessions yet' : 'No sessions match that search'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            {staff
              ? 'Create a session and share its code. Students use that code to join before they open the tutor.'
              : 'Ask your teacher for a session code, enter it above, and the session will show up here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((session) => (
            <article key={session.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold tracking-tight text-slate-900">{session.title}</h2>
                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-600">
                    {session.description || (staff ? 'No description' : `Teacher: ${session.teacherName}`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyCode(session)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-sm font-semibold tracking-[0.18em] text-white"
                  title="Copy join code"
                >
                  {copiedId === session.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {session.joinCode}
                </button>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                {staff ? (
                  <div className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <dt className="sr-only">Students</dt>
                    <dd>
                      {session.members.length} student{session.members.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                ) : (
                  <div>
                    <dt className="sr-only">Teacher</dt>
                    <dd>{session.teacherName}</dd>
                  </div>
                )}
                <div>
                  <dt className="sr-only">{staff ? 'Updated' : 'Joined'}</dt>
                  <dd>{staff ? `Updated ${formatWhen(session.updatedAt)}` : `Joined ${formatWhen(session.joinedAt)}`}</dd>
                </div>
              </dl>

              {staff && session.members.length > 0 && (
                <p className="mt-2 truncate text-xs text-slate-500">
                  {session.members
                    .slice(0, 4)
                    .map((member) => member.studentName)
                    .join(', ')}
                  {session.members.length > 4 ? ` +${session.members.length - 4}` : ''}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(session)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  {staff ? 'Review' : 'Open'}
                </button>
                {staff ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditorError(null);
                        setEditor({
                          mode: 'edit',
                          sessionId: session.id,
                          draft: {
                            title: session.title,
                            description: session.description,
                            joinCode: session.joinCode,
                          },
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(session)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingLeave(session)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                  >
                    Leave
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]"
            onClick={() => {
              if (!saving) setEditor(null);
            }}
          />
          <form
            onSubmit={(event) => void saveDraft(event)}
            className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.55)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {editor.mode === 'create' ? 'New session' : 'Edit session'}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              {editor.mode === 'create' ? 'Create a session' : 'Update this session'}
            </h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Title
              <input
                value={editor.draft.title}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, draft: { ...current.draft, title: event.target.value } } : current
                  )
                }
                maxLength={80}
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Description
              <textarea
                value={editor.draft.description}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, draft: { ...current.draft, description: event.target.value } }
                      : current
                  )
                }
                maxLength={500}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </label>
            <div className="mt-3">
              <p className="text-sm font-medium text-slate-700">Join code</p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={editor.draft.joinCode}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, draft: { ...current.draft, joinCode: normalizeJoinCode(event.target.value) } }
                        : current
                    )
                  }
                  maxLength={12}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-semibold uppercase tracking-[0.22em] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    setEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, joinCode: generateJoinCode() } } : current
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  New code
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Share this code with students. Changing it means new students need the new code. Students who already joined stay in the session.
              </p>
            </div>
            {editorError && <p className="mt-3 text-sm font-medium text-slate-700">{editorError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editor.mode === 'create' ? 'Create session' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <DeleteSessionDialog
          sessionTitle={pendingDelete.title}
          description="Students will no longer be able to join, and this session will disappear from their dashboard."
          note="Tutor conversations already saved for this session stay in the chat history."
          busy={removing}
          confirmLabel="Delete session"
          onConfirm={() => void confirmRemove()}
          onDismiss={() => {
            if (!removing) setPendingDelete(null);
          }}
        />
      )}

      {pendingLeave && (
        <DeleteSessionDialog
          eyebrow="Leave session"
          sessionTitle={pendingLeave.title}
          description="You can join again later with the same code."
          busy={removing}
          confirmLabel="Leave"
          dismissLabel="Stay"
          onConfirm={() => void confirmRemove()}
          onDismiss={() => {
            if (!removing) setPendingLeave(null);
          }}
        />
      )}
    </div>
  );
}
