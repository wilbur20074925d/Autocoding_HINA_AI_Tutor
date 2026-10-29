export const DEBUG_LOG_KEY = 'hina_tutor_debug_log';
const MAX_ENTRIES = 80;

export type DebugLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
};

let writeChain: Promise<void> = Promise.resolve();

export function appendDebugLog(
  source: string,
  message: string,
  level: DebugLogEntry['level'] = 'info'
): Promise<void> {
  const job = writeChain.then(() => appendDebugLogNow(source, message, level));
  writeChain = job.then(
    () => undefined,
    () => undefined
  );
  return job;
}

async function appendDebugLogNow(
  source: string,
  message: string,
  level: DebugLogEntry['level']
): Promise<void> {
  const entry: DebugLogEntry = {
    at: new Date().toISOString(),
    level,
    source,
    message,
  };
  try {
    const stored = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const prev = (stored[DEBUG_LOG_KEY] as DebugLogEntry[] | undefined) || [];
    const next = [...prev, entry].slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ [DEBUG_LOG_KEY]: next });
  } catch {
    /* side panel / SW storage */
  }
}

export async function readDebugLog(): Promise<DebugLogEntry[]> {
  const stored = await chrome.storage.local.get(DEBUG_LOG_KEY);
  return (stored[DEBUG_LOG_KEY] as DebugLogEntry[] | undefined) || [];
}

export async function clearDebugLog(): Promise<void> {
  await chrome.storage.local.set({ [DEBUG_LOG_KEY]: [] });
}
