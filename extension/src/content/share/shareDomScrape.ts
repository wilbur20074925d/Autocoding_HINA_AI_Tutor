import {
  collectChatTurnsFromDocument,
  turnsToLabeledTranscript as formatLabeledTranscript,
  type ChatTurn,
} from './chatDomCollect';

export type ShareTurn = ChatTurn;

export function collectShareTurns(): ShareTurn[] {
  return collectChatTurnsFromDocument(document);
}

export function turnsToLabeledTranscript(turns: ShareTurn[]): string {
  return formatLabeledTranscript(turns, location.hostname);
}

export function scrapeSharePageTranscript(): { transcript: string; turnCount: number } | null {
  const turns = collectShareTurns();
  if (turns.length === 0) return null;
  return { transcript: turnsToLabeledTranscript(turns), turnCount: turns.length };
}

export function waitForShareTurns(timeoutMs = 22000, intervalMs = 500): Promise<ShareTurn[]> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const turns = collectShareTurns();
      if (turns.length > 0) {
        resolve(turns);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Timed out waiting for messages on the share page.'));
        return;
      }
      globalThis.setTimeout(tick, intervalMs);
    };
    tick();
  });
}
