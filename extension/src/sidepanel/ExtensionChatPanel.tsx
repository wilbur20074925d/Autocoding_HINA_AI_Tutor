import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { History, MessageSquare, Network } from 'lucide-react';
import { TutorMessageBubble } from './TutorMessageBubble';
import { ExtensionChatHistoryOverlay } from './ExtensionChatHistoryOverlay';
import type { ChatSessionRow } from '../services/chatSessions';

export interface SidepanelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  turnNumber?: number;
  pending?: 'thinking';
}

const HINA_ICON = chrome.runtime.getURL('hina-icon.png');

export function ExtensionChatPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  messages,
  loading,
  userName,
  userAvatarUrl,
  sessionTitle,
  courseLabel,
  onReplyQuestion,
  onOpenInsights,
  insightsOpen,
  composer,
}: {
  sessions: ChatSessionRow[];
  activeSessionId: string | null;
  onSelectSession: (session: ChatSessionRow) => void;
  messages: SidepanelChatMessage[];
  loading?: boolean;
  userName: string;
  userAvatarUrl: string | null;
  sessionTitle: string;
  courseLabel?: string | null;
  onReplyQuestion?: (question: string) => void;
  onOpenInsights?: () => void;
  insightsOpen?: boolean;
  composer?: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  const promptCount = useMemo(
    () => messages.filter((m) => m.role === 'user' && m.pending !== 'thinking').length,
    [messages]
  );

  const currentTurn = useMemo(() => {
    const turns = messages.map((m) => m.turnNumber).filter((n): n is number => n != null);
    return turns.length ? Math.max(...turns) : 0;
  }, [messages]);

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (a.turnNumber != null && b.turnNumber != null && a.turnNumber !== b.turnNumber) {
        return a.turnNumber - b.turnNumber;
      }
      if (a.role !== b.role) return a.role === 'user' ? -1 : 1;
      return 0;
    });
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeSessionId]);

  const hasMessages = sortedMessages.some((m) => m.content || m.pending === 'thinking');

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header — same structure as web AI Tutor chat column */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span>AI Tutor</span>
              {courseLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{courseLabel}</span>
                </>
              )}
            </div>
            <h1 className="mt-0.5 truncate text-sm font-semibold text-slate-900">{sessionTitle}</h1>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {promptCount} prompt{promptCount === 1 ? '' : 's'}
              {currentTurn > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  Turn {currentTurn}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenInsights && (
              <button
                type="button"
                onClick={onOpenInsights}
                title="Node-level HINA insights"
                aria-label="Open Node-level HINA insights"
                aria-pressed={insightsOpen}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  insightsOpen
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Network className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                HINA
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showHistory
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:text-slate-900'
              }`}
              title="Open chat history"
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </div>
        </div>
      </div>

      {/* Messages — web: flex-1 overflow-y-auto bg-slate-50 */}
      <div
        className={`relative min-h-0 flex-1 ${hasMessages ? 'overflow-y-auto' : 'overflow-hidden'} bg-slate-50 select-text`}
      >
        {loading && !hasMessages && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-4">
            <span className="ext-spinner h-5 w-5 border-[2.5px]" aria-hidden />
            <p className="text-xs font-medium text-slate-500">Loading messages…</p>
          </div>
        )}

        {loading && hasMessages && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center bg-gradient-to-b from-slate-50/95 to-transparent px-3 py-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              <span className="ext-spinner h-3 w-3 border-2" aria-hidden />
              Updating…
            </span>
          </div>
        )}

        {!loading && !hasMessages && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full">
              <img src={HINA_ICON} alt="AI Tutor" className="h-full w-full object-cover" />
            </div>
            <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">
              No messages yet. Ask from any page with your shortcut, or use the box below.
            </p>
          </div>
        )}

        {!loading && hasMessages && (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
            {sortedMessages.map((message) => (
              <div key={message.id} id={`ext-tutor-msg-${message.id}`} className="scroll-mt-4">
                <TutorMessageBubble
                  compact
                  role={message.role}
                  content={message.content}
                  userName={userName}
                  userAvatarUrl={userAvatarUrl}
                  turnNumber={message.turnNumber}
                  pending={message.pending}
                  onReplyQuestion={message.role === 'assistant' ? onReplyQuestion : undefined}
                />
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {composer ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-2 py-2">{composer}</div>
      ) : null}

      {showHistory && (
        <ExtensionChatHistoryOverlay
          sessions={sessions}
          activeSessionId={activeSessionId}
          courseLabel={courseLabel}
          onSelectSession={onSelectSession}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
