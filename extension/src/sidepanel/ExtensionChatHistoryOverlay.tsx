import { useMemo, useState } from 'react';
import { Calendar, Clock, History, MessageSquare, Search, X } from 'lucide-react';
import type { ChatSessionRow } from '../services/chatSessions';

const DATE_GROUPS = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getDateGroup(iso: string): (typeof DATE_GROUPS)[number] {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (date.getTime() >= startOfWeek.getTime()) return 'This week';
  return 'Earlier';
}

export function ExtensionChatHistoryOverlay({
  sessions,
  activeSessionId,
  courseLabel,
  onSelectSession,
  onClose,
}: {
  sessions: ChatSessionRow[];
  activeSessionId: string | null;
  courseLabel?: string | null;
  onSelectSession: (session: ChatSessionRow) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

  const grouped = useMemo(
    () =>
      DATE_GROUPS.map((label) => ({
        label,
        sessions: filtered.filter((s) => getDateGroup(s.updatedAt || new Date().toISOString()) === label),
      })).filter((g) => g.sessions.length > 0),
    [filtered]
  );

  return (
    <div className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg animate-fade-in">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900">
            <History className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">Chat History</h3>
            <p className="truncate text-[11px] text-slate-500">
              {courseLabel ? `Saved in ${courseLabel}` : 'Browse and switch sessions'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
          aria-label="Close history"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-slate-700" />
            <span className="text-xs font-semibold text-slate-900">Your sessions</span>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {filtered.length}
          </span>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-[13px] text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <div className="mb-3 rounded-full border border-slate-200 bg-white p-4">
              <History className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-900">No chat history yet</p>
            <p className="mt-1 text-xs text-slate-500">Create a session in Setup → Chat</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">No matching sessions</div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label}>
                <p className="sticky top-0 z-[1] bg-slate-50/95 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.sessions.map((session) => {
                    const isCurrent = session.id === activeSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          onSelectSession(session);
                          onClose();
                        }}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          isCurrent
                            ? 'border-slate-900 bg-white shadow-sm ring-1 ring-slate-900/10'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <h4 className="truncate text-sm font-semibold text-slate-900">{session.title}</h4>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatSessionDate(session.updatedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {session.messageCount} msg{session.messageCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        {session.lastPreview && (
                          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                            {session.lastPreview}
                          </p>
                        )}
                        {isCurrent && (
                          <span className="mt-2 inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
