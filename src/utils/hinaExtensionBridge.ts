/** Chrome extension content script listens for this on localhost tutor pages. */
export const HINA_EXTENSION_MESSAGE_SOURCE = 'hina-tutor';

export interface HinaExtensionTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  turnNumber: number;
}

export function isLocalHinaTutorHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, port } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false;
  return port === '5174' || port === '4173';
}

/** Push current chat transcript to the HINA Capture extension (no-op off localhost). */
export function publishTranscriptToExtension(payload: {
  sessionId: string | null;
  courseId: string | null;
  title?: string;
  messages: HinaExtensionTranscriptMessage[];
}): void {
  if (!isLocalHinaTutorHost()) return;
  window.postMessage(
    {
      source: HINA_EXTENSION_MESSAGE_SOURCE,
      type: 'CHAT_TRANSCRIPT',
      sessionId: payload.sessionId,
      courseId: payload.courseId,
      title: payload.title,
      messages: payload.messages,
      capturedAt: new Date().toISOString(),
    },
    window.location.origin
  );
}
