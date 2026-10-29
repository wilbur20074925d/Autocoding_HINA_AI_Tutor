import { useMemo } from 'react';
import {
  Calendar,
  Clock,
  GraduationCap,
  Hash,
  Keyboard,
  MessageSquare,
  MonitorPlay,
  Plus,
  Upload,
} from 'lucide-react';
import type { ClassSessionRow } from '../services/classSessions';
import type { ChatSessionRow } from '../services/chatSessions';
import type { ExtensionContext, SyncStatus } from '../shared/scrapeTypes';
import { ClipboardImport } from './ClipboardImport';
import { ShortcutSettings } from './ShortcutSettings';
import { SetupProgress } from './SetupProgress';
import { SetupTinyPage } from './SetupTinyPage';

export type SetupSheet = 'class' | 'chat' | 'shortcuts' | 'capture';

type IconDef = {
  id: SetupSheet;
  label: string;
  icon: typeof GraduationCap;
  disabled?: boolean;
  needsAttention?: boolean;
};

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SetupToolsPanel({
  hubOpen,
  onHubClose,
  sheet,
  onSheetChange,
  hasClass,
  hasChat,
  ctx,
  classSessions,
  chatSessions,
  joinCode,
  onJoinCodeChange,
  onJoin,
  onSelectClass,
  onSelectChat,
  newChatTitle,
  onNewChatTitleChange,
  onCreateChat,
  busy,
  loadError,
  syncStatus,
  onToggleCapture,
  onImportDone,
  onOpenSetup,
}: {
  hubOpen: boolean;
  onHubClose: () => void;
  sheet: SetupSheet | null;
  onSheetChange: (sheet: SetupSheet | null) => void;
  hasClass: boolean;
  hasChat: boolean;
  ctx: ExtensionContext | null;
  classSessions: ClassSessionRow[];
  chatSessions: ChatSessionRow[];
  joinCode: string;
  onJoinCodeChange: (v: string) => void;
  onJoin: () => void;
  onSelectClass: (s: ClassSessionRow) => void;
  onSelectChat: (s: ChatSessionRow) => void;
  newChatTitle: string;
  onNewChatTitleChange: (v: string) => void;
  onCreateChat: () => void;
  busy: boolean;
  loadError: string | null;
  syncStatus: SyncStatus | null;
  onToggleCapture: () => void;
  onImportDone: () => void;
  onOpenSetup?: () => void;
}) {
  const icons: IconDef[] = useMemo(
    () => [
      {
        id: 'class',
        label: 'Class',
        icon: GraduationCap,
        needsAttention: !hasClass,
      },
      {
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        disabled: !hasClass,
        needsAttention: hasClass && !hasChat,
      },
      {
        id: 'shortcuts',
        label: 'Keys',
        icon: Keyboard,
        disabled: !hasChat,
      },
      {
        id: 'capture',
        label: 'Import',
        icon: Upload,
        disabled: !hasChat,
      },
    ],
    [hasClass, hasChat]
  );

  const classMeta = ctx?.classTitle?.trim() || null;
  const chatMeta = ctx?.chatTitle?.trim() || null;

  const hubChips = (
    <>
      <div className="ext-setup-chip-row">
        {icons.map((item) => {
          const Icon = item.icon;
          const active = sheet === item.id;
          const meta =
            item.id === 'class'
              ? classMeta
              : item.id === 'chat'
                ? chatMeta
                : item.id === 'capture' && ctx?.captureEnabled
                  ? 'On'
                  : null;

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              title={meta ? `${item.label}: ${meta}` : item.label}
              onClick={() => onSheetChange(item.id)}
              className={`ext-setup-icon-chip relative flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-1.5 py-2 transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                active
                  ? 'border-slate-800 bg-slate-800 text-white shadow-md'
                  : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {item.needsAttention && !active && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-white" />
              )}
              <Icon className={`h-[18px] w-[18px] ${active ? 'text-white' : 'text-slate-600'}`} strokeWidth={2} />
              <span
                className={`w-full truncate text-center text-[9px] font-bold uppercase tracking-wide ${active ? 'text-slate-200' : 'text-slate-600'}`}
              >
                {item.label}
              </span>
              {meta && (
                <span
                  className={`w-full truncate text-center text-[8px] font-semibold leading-tight ${active ? 'text-slate-300' : 'text-slate-400'}`}
                >
                  {meta}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <SetupProgress embedded hasClass={hasClass} hasChat={hasChat} onOpenSetup={onOpenSetup} />
    </>
  );

  return (
    <>
      {hubOpen && sheet === null && (
        <SetupTinyPage eyebrow="Extension" title="Setup" onClose={onHubClose}>
          <p className="mb-2.5 text-center text-[11px] font-medium leading-relaxed text-slate-500">
            Class, chat session, shortcuts, and import — tap a section to configure.
          </p>
          {hubChips}
        </SetupTinyPage>
      )}

      {sheet === 'class' && (
        <SetupTinyPage eyebrow="Setup" title="Class session" onClose={() => onSheetChange(null)}>
          {loadError && <p className="ext-notice error mb-3">{loadError}</p>}

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Join with code</p>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-600">
                Enter the code from your teacher to add a class.
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                <input
                  className="ext-textarea !min-h-0 py-2 text-center font-mono text-sm tracking-widest uppercase"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => onJoinCodeChange(e.target.value)}
                />
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                  disabled={busy || !joinCode.trim()}
                  onClick={onJoin}
                >
                  Join class
                </button>
              </div>
            </div>

            <div className="ext-setup-list-panel">
              <div className="ext-setup-list-panel-header">
                <div className="flex min-w-0 items-center gap-2">
                  <GraduationCap className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                  <p className="text-xs font-semibold text-slate-900">Your classes</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200">
                  {classSessions.length}
                </span>
              </div>

              {classSessions.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs font-medium leading-relaxed text-slate-500">
                  No classes yet. Join with a code above.
                </p>
              ) : (
                <>
                  <p className="px-2 pb-1 text-center text-[10px] font-medium text-slate-400">
                    Double-click a class to switch — this panel closes automatically.
                  </p>
                  <ul className="ext-setup-scroll m-0 max-h-52 list-none divide-y divide-slate-100 overflow-auto p-2 pt-0">
                  {classSessions.map((s) => {
                    const selected = ctx?.classSessionId === s.id;
                    return (
                      <li key={s.id} className="py-0.5">
                        <button
                          type="button"
                          className={`ext-setup-session-card ${selected ? 'selected' : ''}`}
                          title={`${s.title} · ${s.joinCode}`}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            void onSelectClass(s);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void onSelectClass(s);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="ext-setup-session-title">{s.title}</p>
                            {selected ? <span className="ext-setup-session-badge">Active</span> : null}
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <Hash className="ext-setup-session-meta h-3 w-3 shrink-0" aria-hidden />
                            <span className="ext-setup-session-code">{s.joinCode}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </div>
          </div>
        </SetupTinyPage>
      )}

      {sheet === 'chat' && hasClass && (
        <SetupTinyPage eyebrow="Setup" title="Chat session" onClose={() => onSheetChange(null)}>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Save target</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                Tutor Q&amp;A and imports sync to the session you pick — same history as the web app.
              </p>
              {ctx?.classTitle && (
                <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  <GraduationCap className="h-3 w-3 shrink-0" />
                  <span className="truncate">{ctx.classTitle}</span>
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">New chat</p>
                  <p className="text-[11px] text-slate-500">Create a session for this class</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-col gap-2">
                <input
                  className="ext-textarea !min-h-0 py-2"
                  value={newChatTitle}
                  onChange={(e) => onNewChatTitleChange(e.target.value)}
                  placeholder="Session title"
                />
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                  disabled={busy}
                  onClick={onCreateChat}
                >
                  <Plus className="h-4 w-4" />
                  Create chat
                </button>
              </div>
            </div>

            <div className="ext-setup-list-panel">
              <div className="ext-setup-list-panel-header">
                <div className="flex min-w-0 items-center gap-2">
                  <MessageSquare className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                  <p className="text-xs font-semibold text-slate-900">Saved chats</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200">
                  {chatSessions.length}
                </span>
              </div>

              {chatSessions.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs font-medium leading-relaxed text-slate-500">
                  Create a chat to save tutor history.
                </p>
              ) : (
                <>
                  <p className="px-3 pb-1 pt-2 text-center text-[10px] font-medium text-slate-400">
                    Swipe or scroll left / right to browse · double-click to open
                  </p>
                  <ul className="ext-setup-chat-rail" aria-label="Saved chat sessions">
                    {chatSessions.map((s) => {
                      const selected = ctx?.chatSessionId === s.id;
                      return (
                        <li key={s.id} className="ext-setup-chat-rail-item">
                          <button
                            type="button"
                            className={`ext-setup-session-card ext-setup-chat-card ${selected ? 'selected' : ''}`}
                            title={s.title}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              void onSelectChat(s);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void onSelectChat(s);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="ext-setup-session-title line-clamp-2">{s.title}</p>
                              {selected ? <span className="ext-setup-session-badge">Active</span> : null}
                            </div>
                            <div className="ext-setup-session-meta mt-auto flex flex-col gap-1 pt-2">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0" />
                                {formatShortDate(s.updatedAt)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                {s.messageCount} msg{s.messageCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            {s.lastPreview ? (
                              <p className="ext-setup-session-preview mt-1.5 line-clamp-3 text-[10px] leading-snug text-slate-500">
                                {s.lastPreview}
                              </p>
                            ) : (
                              <p className="mt-1.5 text-[10px] italic text-slate-400">No messages yet</p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        </SetupTinyPage>
      )}

      {sheet === 'shortcuts' && hasChat && (
        <SetupTinyPage eyebrow="Setup" title="Keyboard shortcuts" onClose={() => onSheetChange(null)}>
          <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <ShortcutSettings compact />
          </div>
        </SetupTinyPage>
      )}

      {sheet === 'capture' && hasChat && (
        <SetupTinyPage
          eyebrow="Optional"
          title="Import & capture"
          onClose={() => onSheetChange(null)}
          action={
            ctx?.captureEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                <MonitorPlay className="h-3 w-3" />
                Recording
              </span>
            ) : null
          }
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-900">Archive external chat</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Paste from ChatGPT or similar into this session.</p>
              <div className="mt-2">
                <ClipboardImport disabled={busy} onImported={onImportDone} />
              </div>
              {syncStatus?.lastError && <p className="ext-notice error mt-2">{syncStatus.lastError}</p>}
              {syncStatus?.lastAt && (
                <p className="ext-notice success mt-2">
                  Last sync {new Date(syncStatus.lastAt).toLocaleTimeString()} · {syncStatus.lastUpserted} rows
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Live capture</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-500">
                    Mirror <strong className="text-slate-700">localhost:5174</strong> while recording.
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    ctx?.captureEnabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${ctx?.captureEnabled ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`}
                  />
                  {ctx?.captureEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                onClick={onToggleCapture}
              >
                {ctx?.captureEnabled ? 'Pause localhost mirror' : 'Start localhost mirror'}
              </button>
            </div>
          </div>
        </SetupTinyPage>
      )}
    </>
  );
}
