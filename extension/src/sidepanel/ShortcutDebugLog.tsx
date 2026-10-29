import { useCallback, useEffect, useState } from 'react';
import { clearDebugLog, DEBUG_LOG_KEY, readDebugLog, type DebugLogEntry } from '../shared/debugLog';
import { TUTOR_MSG } from '../shared/tutorMessages';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function ShortcutDebugLog() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [diagnose, setDiagnose] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLogs(await readDebugLog());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes[DEBUG_LOG_KEY]) void refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      window.clearInterval(timer);
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, [refresh]);

  const runDiagnose = async () => {
    setDiagnose(null);
    const res = (await chrome.runtime.sendMessage({ type: TUTOR_MSG.DIAGNOSE_TAB })) as {
      ok?: boolean;
      url?: string;
      ping?: boolean;
      loader?: string | null;
      error?: string;
    };
    if (!res?.ok) {
      setDiagnose(res?.error || 'Diagnose failed.');
    } else {
      setDiagnose(
        `Tab: ${res.url || '?'} · ping: ${res.ping ? 'OK' : 'FAIL'} · loader: ${res.loader || 'missing'}`
      );
    }
    void refresh();
  };

  return (
    <div className="card stack" style={{ padding: '10px 12px' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Activity log</strong>
        <div className="row" style={{ gap: '6px' }}>
          <button type="button" onClick={() => void runDiagnose()}>
            Diagnose active tab
          </button>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" onClick={() => void clearDebugLog().then(refresh)}>
            Clear
          </button>
        </div>
      </div>
      {diagnose && <p className="muted" style={{ fontSize: '12px' }}>{diagnose}</p>}
      <div
        style={{
          maxHeight: 220,
          overflow: 'auto',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '8px',
          borderRadius: '8px',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No logs yet. Run a test button or ⌘W / ⌘⇧W on a website tab.</div>
        ) : (
          logs
            .slice()
            .reverse()
            .map((entry, index) => (
              <div key={`${entry.at}-${index}`} style={{ marginBottom: 6 }}>
                <span style={{ color: entry.level === 'error' ? '#fca5a5' : entry.level === 'warn' ? '#fde047' : '#93c5fd' }}>
                  [{formatTime(entry.at)}] {entry.level} · {entry.source}:
                </span>{' '}
                {entry.message}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
