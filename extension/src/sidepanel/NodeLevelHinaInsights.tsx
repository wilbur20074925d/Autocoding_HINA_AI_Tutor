import { StudentHinaAnalysis } from '@hina/components/AITutorNew/StudentHinaAnalysis';
import type { GeminiLabelFn } from '@hina/hooks/useLiveHinaLabelling';
import type { HinaSourceMessage } from '@hina/utils/hinaAnalysis';

export function NodeLevelHinaInsights({
  chatTitle,
  chatSessionId,
  hinaMessages,
  compareSessions,
  loadSessionMessagesForCompare,
  geminiLabelFn,
}: {
  chatTitle: string;
  chatSessionId: string | null;
  hinaMessages: HinaSourceMessage[];
  compareSessions: { id: string; title: string; updatedAt: string }[];
  loadSessionMessagesForCompare: (sessionId: string) => Promise<HinaSourceMessage[]>;
  geminiLabelFn?: GeminiLabelFn;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <StudentHinaAnalysis
        embedded
        extensionPanel
        open
        messages={hinaMessages}
        sessionTitle={chatTitle}
        sessions={compareSessions}
        currentSessionId={chatSessionId}
        loadSessionMessages={loadSessionMessagesForCompare}
        onClose={() => undefined}
        onJumpToMessage={() => undefined}
        geminiLabelFn={geminiLabelFn}
      />
    </div>
  );
}
