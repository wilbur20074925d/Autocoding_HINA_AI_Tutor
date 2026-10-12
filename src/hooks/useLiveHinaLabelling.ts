import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHinaProfile,
  buildHinaProfileFromCoded,
  type HinaProfile,
  type HinaSourceMessage,
} from '../utils/hinaAnalysis';
import {
  heuristicLabelRows,
  labelHinaMessagesWithGemini,
  rowsToCodedMessages,
  type HinaLabelRow,
} from '../utils/hinaLabelling';

const DEFAULT_GEMINI_DEBOUNCE_MS = 6500;

export interface LiveHinaLabelling {
  labelRows: HinaLabelRow[];
  labelSource: 'gemini' | 'heuristic';
  labelling: boolean;
  profile: HinaProfile;
  lastUpdatedAt: number;
  /** Message fingerprint currently reflected in the profile. */
  fingerprint: string;
}

/**
 * Live node-level HINA labelling while a student chats.
 * Heuristic codes update immediately on each new turn; Gemini refreshes
 * on a debounce so analysis stays current without re-calling on every token.
 */
export const useLiveHinaLabelling = (
  messages: HinaSourceMessage[],
  options?: { geminiDebounceMs?: number; enabled?: boolean }
): LiveHinaLabelling => {
  const enabled = options?.enabled !== false;
  const debounceMs = options?.geminiDebounceMs ?? DEFAULT_GEMINI_DEBOUNCE_MS;

  const persistable = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
    [messages]
  );
  const fingerprint = useMemo(
    () => persistable.map((message) => `${message.id}:${message.content}`).join('\n'),
    [persistable]
  );

  const [labelRows, setLabelRows] = useState<HinaLabelRow[]>(() => heuristicLabelRows(persistable));
  const [labelSource, setLabelSource] = useState<'gemini' | 'heuristic'>('heuristic');
  const [labelling, setLabelling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const requestIdRef = useRef(0);

  // Instant heuristic pass whenever the chat grows or changes.
  useEffect(() => {
    if (!enabled) return;
    const next = heuristicLabelRows(persistable);
    setLabelRows(next);
    setLabelSource('heuristic');
    setLastUpdatedAt(Date.now());
  }, [enabled, fingerprint, persistable]);

  // Debounced Gemini refresh — “from time to time” while chatting.
  useEffect(() => {
    if (!enabled) return;
    if (persistable.length < 2) {
      setLabelling(false);
      return;
    }

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    setLabelling(true);

    const timer = window.setTimeout(() => {
      void labelHinaMessagesWithGemini(persistable).then((result) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setLabelRows(result.rows);
        setLabelSource(result.source);
        setLabelling(false);
        setLastUpdatedAt(Date.now());
      });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, fingerprint, persistable, debounceMs]);

  const profile = useMemo(
    () =>
      labelRows.length > 0
        ? buildHinaProfileFromCoded(rowsToCodedMessages(labelRows))
        : buildHinaProfile(persistable),
    [labelRows, persistable]
  );

  return {
    labelRows,
    labelSource,
    labelling,
    profile,
    lastUpdatedAt,
    fingerprint,
  };
};

export const formatHinaUpdatedAgo = (lastUpdatedAt: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - lastUpdatedAt) / 1000));
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};
