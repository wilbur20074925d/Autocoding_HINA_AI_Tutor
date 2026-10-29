import { BG_MESSAGE, type ScrapePayload, type ScrapedTurn } from '../../shared/scrapeTypes';
import {
  HINA_EXTENSION_MESSAGE_SOURCE,
  type HinaExtensionTranscriptMessage,
} from '@hina/utils/hinaExtensionBridge';

const DEBOUNCE_MS = 400;

let lastFingerprint = '';
let debounceTimer: number | undefined;

function fingerprintTurns(turns: ScrapedTurn[]): string {
  return turns.map((t) => `${t.role}:${t.clientMessageId}:${t.content.length}`).join('|');
}

function toScrapePayload(data: {
  sessionId: string | null;
  courseId: string | null;
  title?: string;
  messages: HinaExtensionTranscriptMessage[];
  capturedAt: string;
}): ScrapePayload {
  const turns: ScrapedTurn[] = data.messages.map((message, index) => ({
    clientMessageId: message.id,
    role: message.role,
    content: message.content,
    turnNumber: message.turnNumber || index + 1,
  }));
  const transcriptRaw = turns.map((t) => `[${t.role.toUpperCase()}]\n${t.content}`).join('\n\n---\n\n');
  const threadKey = data.sessionId || data.courseId || 'local-draft';
  const url = location.href;

  return {
    platform: 'hina-tutor-local',
    url,
    threadKey,
    transcriptRaw,
    turns,
    capturedAt: data.capturedAt,
    fingerprint: `${threadKey}|${fingerprintTurns(turns)}`,
  };
}

function emit(payload: ScrapePayload): void {
  if (payload.turns.length === 0) return;
  if (payload.fingerprint === lastFingerprint) return;
  lastFingerprint = payload.fingerprint;
  void chrome.runtime.sendMessage({ type: BG_MESSAGE.SCRAPE, payload }).catch(() => undefined);
}

function handleTranscript(event: MessageEvent): void {
  if (event.origin !== location.origin) return;
  const data = event.data;
  if (!data || data.source !== HINA_EXTENSION_MESSAGE_SOURCE || data.type !== 'CHAT_TRANSCRIPT') return;

  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const payload = toScrapePayload({
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
      courseId: typeof data.courseId === 'string' ? data.courseId : null,
      title: typeof data.title === 'string' ? data.title : undefined,
      messages: Array.isArray(data.messages) ? data.messages : [],
      capturedAt: typeof data.capturedAt === 'string' ? data.capturedAt : new Date().toISOString(),
    });
    emit(payload);
  }, DEBOUNCE_MS);
}

window.addEventListener('message', handleTranscript);

console.info('[HINA Capture] Localhost tutor bridge active on', location.href);
