import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { LoginForm } from './components/Auth/LoginForm';
import AITestChatbox, { type ChatReportData } from './components/AITutorNew/AITestChatbox';
import ChatReport from './components/AITutorNew/ChatReport';
import { AITutorSessionsPage } from './components/Teacher/AITutorSessionsPage';
import { ActivityTrackingProvider } from './contexts/ActivityTrackingContext';
import type { User } from './lib/supabase';
import { AuthService } from './services/authService';
import { isStaffRole } from './utils/roles';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<ChatReportData | null>(null);

  useEffect(() => {
    let cancelled = false;
    AuthService.getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    await AuthService.signOut();
    setUser(null);
    setReport(null);
  };

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  const staff = isStaffRole(user.role);
  const chatFillsScreen = !staff && !report;

  return (
    <ActivityTrackingProvider
      currentUser={user}
      currentView={staff ? 'ai-tutor-sessions' : report ? 'chat-report' : 'ai-test'}
    >
      <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <img src="/images/streamlearn-logo.png" alt="Hina Tutor" className="h-8 w-auto" />
            <div>
              <p className="text-sm font-semibold tracking-tight">Hina Tutor</p>
              <p className="text-xs text-slate-500">{staff ? 'Teacher' : 'Student'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user.name || user.email}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-900 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </header>
        <main className={chatFillsScreen ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-4 md:p-6'}>
          {staff ? (
            <AITutorSessionsPage currentUser={user} students={[]} course={null} />
          ) : report ? (
            <ChatReport {...report} onBack={() => setReport(null)} />
          ) : (
            <AITestChatbox
              courseId={null}
              courseCode={null}
              isActive
              isTeacher={false}
              onGenerateReport={setReport}
            />
          )}
        </main>
      </div>
    </ActivityTrackingProvider>
  );
}
