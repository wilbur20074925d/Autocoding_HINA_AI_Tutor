import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { labelHinaMessagesViaEdge } from '@hina/services/hinaEdgeLabel';
import { BG_MESSAGE, STORAGE_KEYS, type ExtensionContext, type SyncStatus } from '../shared/scrapeTypes';
import { readContext, writeContext, readSyncStatus } from '../lib/contextStorage';
import { fetchExtensionUser, getSupabase, isSupabaseConfigured, type ExtensionUser } from '../lib/supabase';
import { joinClassSession, listClassSessionsForStudent, type ClassSessionRow } from '../services/classSessions';
import {
  createChatSession,
  listChatSessions,
  loadChatMessages,
  type ChatSessionRow,
} from '../services/chatSessions';
import type { HinaSourceMessage } from '@hina/utils/hinaAnalysis';
import { ChevronDown, Eye, EyeOff, Lock, LogIn, LogOut, Mail, SlidersHorizontal } from 'lucide-react';
import { TutorAskSection } from './TutorAskSection';
import { SetupToolsPanel, type SetupSheet } from './SetupToolsPanel';
import { SetupTinyPage } from './SetupTinyPage';
import { NodeLevelHinaInsights } from './NodeLevelHinaInsights';
import { ExtensionChatPanel, type SidepanelChatMessage } from './ExtensionChatPanel';
import { syncOverlayBrandingFromUser } from '../lib/syncOverlayBranding';

const HINA_ICON = chrome.runtime.getURL('hina-icon.png');
const HINA_SIGNIN_HERO = chrome.runtime.getURL('hina-ai-tutor-hero.png');

export function App() {
  const [user, setUser] = useState<ExtensionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [ctx, setCtx] = useState<ExtensionContext | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const [classSessions, setClassSessions] = useState<ClassSessionRow[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [newChatTitle, setNewChatTitle] = useState('External AI chat');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [hinaMessages, setHinaMessages] = useState<HinaSourceMessage[]>([]);
  const [chatThread, setChatThread] = useState<SidepanelChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [setupHubOpen, setSetupHubOpen] = useState(false);
  const [setupSheet, setSetupSheet] = useState<SetupSheet | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [askPrefill, setAskPrefill] = useState('');

  const loadReqRef = useRef(0);
  const userRef = useRef(user);
  const chatSessionIdRef = useRef<string | null>(ctx?.chatSessionId ?? null);
  userRef.current = user;
  chatSessionIdRef.current = ctx?.chatSessionId ?? null;

  const compareSessions = useMemo(
    () =>
      chatSessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
      })),
    [chatSessions]
  );

  const geminiLabelFn = useCallback(
    (messages: HinaSourceMessage[]) => labelHinaMessagesViaEdge(getSupabase(), messages),
    []
  );

  const loadSessionMessagesForCompare = useCallback(
    async (sessionId: string): Promise<HinaSourceMessage[]> => {
      if (!user) return [];
      const rows = await loadChatMessages(sessionId, user.id);
      return rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
      }));
    },
    [user]
  );

  const refreshSyncStatus = useCallback(async () => {
    setSyncStatus(await readSyncStatus());
  }, []);

  const refreshContext = useCallback(async () => {
    setCtx(await readContext());
  }, []);

  const loadHinaFromSession = useCallback(
    async (chatSessionId: string | null, userId: string, options?: { foreground?: boolean }) => {
      if (!chatSessionId) {
        loadReqRef.current += 1;
        setHinaMessages([]);
        setChatThread([]);
        setChatLoading(false);
        return;
      }

      const reqId = ++loadReqRef.current;
      const showBlockingLoader = options?.foreground === true;
      if (showBlockingLoader) {
        setChatLoading(true);
        setChatThread([]);
        setHinaMessages([]);
      }

      try {
        const rows = await loadChatMessages(chatSessionId, userId);
        if (reqId !== loadReqRef.current) return;

        const mapped = rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          turnNumber: r.turnNumber,
        }));
        setChatThread(mapped);
        setHinaMessages(
          mapped.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
          }))
        );
      } catch {
        if (reqId !== loadReqRef.current) return;
        setHinaMessages([]);
        setChatThread([]);
      } finally {
        if (reqId === loadReqRef.current && showBlockingLoader) {
          setChatLoading(false);
        }
      }
    },
    []
  );

  const reloadClassSessions = useCallback(async (userId: string) => {
    const rows = await listClassSessionsForStudent(userId);
    setClassSessions(rows);
  }, []);

  const reloadChatSessions = useCallback(
    async (userId: string, classId: string | null, joinCode: string | null) => {
      if (!classId) {
        setChatSessions([]);
        return;
      }
      const rows = await listChatSessions(userId, classId, joinCode);
      setChatSessions(rows);
    },
    []
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthLoading(false);
      setAuthError('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the project .env, then rebuild.');
      return;
    }
    const supabase = getSupabase();
    void (async () => {
      await refreshContext();
      await refreshSyncStatus();
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        const profile = await fetchExtensionUser(data.session.user.id);
        if (profile) {
          setUser(profile);
          await syncOverlayBrandingFromUser(profile);
          await reloadClassSessions(profile.id);
        }
      }
      setAuthLoading(false);
    })();

    const onStorage = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.context]) void refreshContext();
      if (changes[STORAGE_KEYS.syncStatus]) {
        void refreshSyncStatus().then(async () => {
          const session = await readContext();
          const { data } = await getSupabase().auth.getSession();
          const uid = data.session?.user?.id;
          if (uid && session.chatSessionId) {
            void loadHinaFromSession(session.chatSessionId, uid, { foreground: false });
          }
        });
      }
    };
    chrome.storage.onChanged.addListener(onStorage);

    const onMessage = (msg: { type?: string }) => {
      if (msg?.type === BG_MESSAGE.SYNC_STATUS) {
        void refreshSyncStatus();
        const uid = userRef.current?.id;
        const sid = chatSessionIdRef.current;
        if (uid && sid) {
          void loadHinaFromSession(sid, uid, { foreground: false });
        }
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refreshContext, refreshSyncStatus, reloadClassSessions, loadHinaFromSession]);

  useEffect(() => {
    if (!user || !ctx?.classSessionId) return;
    void reloadChatSessions(user.id, ctx.classSessionId, ctx.classJoinCode);
  }, [user, ctx?.classSessionId, ctx?.classJoinCode, reloadChatSessions]);

  useEffect(() => {
    if (!user?.id || !ctx?.chatSessionId) {
      loadReqRef.current += 1;
      setChatThread([]);
      setHinaMessages([]);
      setChatLoading(false);
      return;
    }
    void loadHinaFromSession(ctx.chatSessionId, user.id, { foreground: true });
  }, [user?.id, ctx?.chatSessionId, loadHinaFromSession]);


  useEffect(() => {
    setInsightsOpen(false);
  }, [ctx?.chatSessionId]);

  const signIn = async () => {
    setAuthError(null);
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user?.id) throw new Error('No user returned');
      const profile = await fetchExtensionUser(data.user.id);
      if (!profile) throw new Error('Could not load profile.');
      setUser(profile);
      await syncOverlayBrandingFromUser(profile);
      await reloadClassSessions(profile.id);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    setClassSessions([]);
    setChatSessions([]);
    setHinaMessages([]);
    await writeContext({
      captureEnabled: false,
      classSessionId: null,
      classJoinCode: null,
      classTitle: null,
      chatSessionId: null,
      chatTitle: null,
    });
    await refreshContext();
  };

  const selectClass = async (session: ClassSessionRow) => {
    const next = await writeContext({
      classSessionId: session.id,
      classJoinCode: session.joinCode,
      classTitle: session.title,
      chatSessionId: null,
      chatTitle: null,
    });
    setCtx(next);
    if (user) await reloadChatSessions(user.id, session.id, session.joinCode);
    setSetupSheet(null);
    setSetupHubOpen(false);
  };

  const selectChat = async (session: ChatSessionRow) => {
    const next = await writeContext({
      chatSessionId: session.id,
      chatTitle: session.title,
    });
    setCtx(next);
    setSetupSheet(null);
    setSetupHubOpen(false);
    if (user) await loadHinaFromSession(session.id, user.id, { foreground: true });
  };

  const onJoin = async () => {
    if (!user) return;
    setLoadError(null);
    setBusy(true);
    try {
      const joined = await joinClassSession(joinCode);
      await reloadClassSessions(user.id);
      await selectClass(joined);
      setJoinCode('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateChat = async () => {
    if (!user || !ctx?.classSessionId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const created = await createChatSession(user.id, newChatTitle, ctx.classSessionId);
      await reloadChatSessions(user.id, ctx.classSessionId, ctx.classJoinCode);
      await selectChat(created);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleCapture = async () => {
    const next = await writeContext({ captureEnabled: !ctx?.captureEnabled });
    setCtx(next);
  };

  if (authLoading) {
    return (
      <div className="ext-shell min-h-screen items-center justify-center">
        <span className="ext-spinner" aria-hidden />
        <p className="text-sm font-medium text-slate-500">Loading your session…</p>
      </div>
    );
  }

  const canSubmitSignIn = email.trim().length > 0 && password.length > 0 && !busy;

  if (!user) {
    return (
      <div className="ext-shell ext-signin-shell min-h-screen justify-center">
        <div className="ext-signin-card overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/60">
          <div className="ext-signin-hero border-b border-slate-100 bg-gradient-to-b from-white via-slate-50/80 to-slate-50 px-5 pb-4 pt-5">
            <div className="mx-auto flex max-w-[220px] justify-center">
              <img
                src={HINA_SIGNIN_HERO}
                alt="Autocoding HINA AI Tutor"
                className="ext-signin-hero-img h-auto w-full object-contain drop-shadow-sm"
              />
            </div>
            <p className="mx-auto mt-3 max-w-[18rem] text-center text-xs font-medium leading-relaxed text-slate-500">
              Sign in with the same account as the web app to sync classes and chat history.
            </p>
          </div>

          <form
            className="flex flex-col gap-3.5 p-4 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmitSignIn) void signIn();
            }}
          >
            {authError && (
              <p className="ext-notice error ext-signin-error" role="alert">
                {authError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="ext-signin-email" className="text-xs font-semibold tracking-tight text-slate-700">
                Email
              </label>
              <div className="ext-signin-field">
                <Mail className="ext-signin-field-icon" aria-hidden />
                <input
                  id="ext-signin-email"
                  type="email"
                  className="ext-signin-field-input"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ext-signin-password" className="text-xs font-semibold tracking-tight text-slate-700">
                Password
              </label>
              <div className="ext-signin-field">
                <Lock className="ext-signin-field-icon" aria-hidden />
                <input
                  id="ext-signin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="ext-signin-field-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="ext-signin-field-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="group mt-0.5 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canSubmitSignIn}
            >
              {busy ? (
                <>
                  <span className="ext-spinner !h-4 !w-4 !border-2 !border-white/30 !border-t-white" aria-hidden />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                  Sign in
                </>
              )}
            </button>

            <p className="text-center text-[11px] font-medium text-slate-400">
              Use your HINA web app credentials
            </p>
          </form>
        </div>
      </div>
    );
  }

  const hasClass = Boolean(ctx?.classSessionId);
  const hasChat = Boolean(ctx?.chatSessionId);

  return (
    <div className="ext-shell ext-shell-main relative">
      <header className="ext-app-header shrink-0">
        <div className="ext-app-header-brand">
          <img src={HINA_ICON} alt="" className="ext-app-header-logo" />
          <div className="ext-app-header-titles">
            <h1 className="ext-app-header-name">HINA Capture</h1>
            <p className="ext-app-header-user" title={user.name || user.email}>
              {user.name || user.email}
            </p>
          </div>
        </div>
        <div className="ext-app-header-actions">
          <button
            type="button"
            className={`ext-app-header-btn ext-app-header-btn-setup ${
              setupHubOpen || setupSheet ? 'ext-app-header-btn-active' : ''
            }`}
            aria-expanded={setupHubOpen || Boolean(setupSheet)}
            aria-label="Open setup"
            title="Setup — class, chat, keys, import"
            onClick={() => {
              if (setupSheet) {
                setSetupSheet(null);
                setSetupHubOpen(true);
                return;
              }
              setSetupHubOpen((open) => !open);
            }}
          >
            {(!hasClass || !hasChat) && !setupHubOpen && !setupSheet && (
              <span className="ext-app-header-attention" aria-hidden />
            )}
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="ext-app-header-btn-label">Setup</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </button>
          <button
            type="button"
            className="ext-app-header-btn"
            aria-label="Log out"
            title="Log out"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="ext-app-header-btn-label">Log out</span>
          </button>
        </div>
      </header>

      <SetupToolsPanel
        hubOpen={setupHubOpen}
        onHubClose={() => {
          setSetupHubOpen(false);
          setSetupSheet(null);
        }}
        sheet={setupSheet}
        onSheetChange={setSetupSheet}
        hasClass={hasClass}
        hasChat={hasChat}
        ctx={ctx}
        classSessions={classSessions}
        chatSessions={chatSessions}
        joinCode={joinCode}
        onJoinCodeChange={setJoinCode}
        onJoin={() => void onJoin()}
        onSelectClass={(s) => void selectClass(s)}
        onSelectChat={(s) => void selectChat(s)}
        newChatTitle={newChatTitle}
        onNewChatTitleChange={setNewChatTitle}
        onCreateChat={() => void onCreateChat()}
        busy={busy}
        loadError={loadError}
        syncStatus={syncStatus}
        onToggleCapture={() => void toggleCapture()}
        onImportDone={() => {
          void refreshSyncStatus();
          if (user && ctx?.chatSessionId) {
            void loadHinaFromSession(ctx.chatSessionId, user.id, { foreground: false });
          }
        }}
        onOpenSetup={() => {
          setSetupHubOpen(true);
          setSetupSheet(!hasClass ? 'class' : !hasChat ? 'chat' : 'shortcuts');
        }}
      />

      {insightsOpen && hasChat && (
        <SetupTinyPage
          tall
          fillContent
          eyebrow="Insights"
          title="Node-level HINA"
          onClose={() => setInsightsOpen(false)}
        >
          <NodeLevelHinaInsights
            chatTitle={ctx?.chatTitle || 'This chat'}
            chatSessionId={ctx?.chatSessionId ?? null}
            hinaMessages={hinaMessages}
            compareSessions={compareSessions}
            loadSessionMessagesForCompare={loadSessionMessagesForCompare}
            geminiLabelFn={geminiLabelFn}
          />
        </SetupTinyPage>
      )}

      <div className="ext-chat-panel-fill">
        {hasClass ? (
          <ExtensionChatPanel
            sessions={chatSessions}
            activeSessionId={ctx?.chatSessionId ?? null}
            onSelectSession={(session) => void selectChat(session)}
            messages={hasChat ? chatThread : []}
            loading={chatLoading}
            userName={user.name || user.email}
            userAvatarUrl={user.avatarUrl}
            sessionTitle={ctx?.chatTitle || (hasChat ? 'Chat' : 'Pick a session')}
            courseLabel={ctx?.classTitle || ctx?.classJoinCode || null}
            onReplyQuestion={(question) => setAskPrefill(question)}
            onOpenInsights={
              hasChat
                ? () => {
                    setSetupHubOpen(false);
                    setSetupSheet(null);
                    setInsightsOpen(true);
                  }
                : undefined
            }
            insightsOpen={insightsOpen}
            composer={
              hasChat ? (
                <TutorAskSection
                  disabled={busy}
                  prefillQuestion={askPrefill}
                  onPrefillConsumed={() => setAskPrefill('')}
                  onAskStart={(question) => {
                    setChatThread((prev) => [
                      ...prev.filter((m) => m.id !== 'optimistic-thinking'),
                      { id: `opt-u-${Date.now()}`, role: 'user', content: question },
                      { id: 'optimistic-thinking', role: 'assistant', content: '', pending: 'thinking' },
                    ]);
                  }}
                  onAnswered={() => {
                    void refreshSyncStatus();
                    if (user && ctx.chatSessionId) {
                      void loadHinaFromSession(ctx.chatSessionId, user.id, { foreground: false });
                    }
                  }}
                />
              ) : undefined
            }
          />
        ) : (
          <div className="ext-chat-panel-empty">
            <p className="text-sm font-semibold text-slate-800">AI Tutor</p>
            <p className="mt-1 max-w-[14rem] text-xs font-medium leading-relaxed text-slate-500">
              Open <strong className="text-slate-700">Setup</strong> to join a class and pick a chat session.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
