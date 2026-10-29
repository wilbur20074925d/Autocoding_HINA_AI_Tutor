import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { LoginForm } from './components/Auth/LoginForm';
import AITestChatbox, { type ChatReportData } from './components/AITutorNew/AITestChatbox';
import ChatReport from './components/AITutorNew/ChatReport';
import { SessionDashboard } from './components/Sessions/SessionDashboard';
import { AITutorSessionsPage } from './components/Teacher/AITutorSessionsPage';
import { ActivityTrackingProvider } from './contexts/ActivityTrackingContext';
import type { User } from './lib/supabase';
import { AuthService } from './services/authService';
import type { ClassSession } from './services/classSessionService';
import type { Course } from './types';
import { isStaffRole } from './utils/roles';

function sessionAsCourse(session: ClassSession): Course {
  return {
    id: session.id,
    code: session.joinCode,
    name: session.title,
    description: session.description,
    teacherId: session.teacherId,
  };
}

function membersAsUsers(session: ClassSession): User[] {
  return session.members.map((member) => ({
    id: member.studentId,
    name: member.studentName || 'Student',
    email: member.studentEmail,
    role: 'student',
    created_at: member.joinedAt,
    updated_at: member.joinedAt,
  }));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<ChatReportData | null>(null);
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null);

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
    setActiveSession(null);
  };

  const backToSessions = () => {
    setReport(null);
    setActiveSession(null);
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
  const chatFillsScreen = !staff && Boolean(activeSession) && !report;
  const currentView = !activeSession
    ? 'class-sessions'
    : staff
      ? 'ai-tutor-sessions'
      : report
        ? 'chat-report'
        : 'ai-test';

  return (
    <ActivityTrackingProvider
      currentUser={user}
      currentView={currentView}
      selectedCourseId={activeSession?.id ?? null}
      selectedCourseCode={activeSession?.joinCode ?? null}
    >
      <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/images/HINA%20AI%20Tutor.png"
              alt="Autocoding HINA AI Tutor"
              className="h-12 w-12 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Autocoding HINA AI Tutor</p>
              <p className="truncate text-xs text-slate-500">
                {activeSession ? activeSession.title : staff ? 'Teacher' : 'Student'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            {activeSession && (
              <button
                type="button"
                onClick={backToSessions}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-900 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Sessions
              </button>
            )}
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
          {!activeSession ? (
            <SessionDashboard currentUser={user} onOpen={setActiveSession} />
          ) : staff ? (
            <AITutorSessionsPage
              currentUser={user}
              students={membersAsUsers(activeSession)}
              course={sessionAsCourse(activeSession)}
              scopeToCourse
            />
          ) : report ? (
            <ChatReport {...report} onBack={() => setReport(null)} />
          ) : (
            <AITestChatbox
              courseId={activeSession.id}
              courseCode={activeSession.joinCode}
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
