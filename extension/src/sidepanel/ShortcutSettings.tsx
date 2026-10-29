import { useCallback, useEffect, useState } from 'react';
import {
  defaultShortcutForCommand,
  formatShortcutForDisplay,
  isMacPlatform,
  listExtensionCommands,
  resetExtensionShortcut,
  shortcutFromKeyboardEvent,
  TUTOR_COMMAND_DEFS,
  TUTOR_COMMANDS,
  type TutorCommandName,
  updateExtensionShortcut,
} from '../lib/extensionCommands';
import { saveShortcutBindings } from '../lib/shortcutBindings';
import { TUTOR_MSG } from '../shared/tutorMessages';
import { readLastShortcutError } from '../services/userFeedback';
import { ShortcutDebugLog } from './ShortcutDebugLog';
import { appendDebugLog } from '../shared/debugLog';

export function ShortcutSettings({ compact = false }: { compact?: boolean }) {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<TutorCommandName | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRunError, setLastRunError] = useState<string | null>(null);

  const mac = isMacPlatform();
  const pasteDefault = mac ? '⌘W (Command+W)' : 'Ctrl+W';
  const shotDefault = mac ? '⌘⇧W (Command+Shift+W)' : 'Ctrl+Shift+W';

  const refresh = useCallback(async () => {
    const commands = await listExtensionCommands();
    const map: Record<string, string> = {};
    for (const cmd of commands) {
      if (cmd.name && cmd.shortcut) map[cmd.name] = cmd.shortcut;
    }
    setShortcuts(map);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const def of TUTOR_COMMAND_DEFS) {
        if (!next[def.name]) next[def.name] = map[def.name] || defaultShortcutForCommand(def.name);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void readLastShortcutError().then(setLastRunError);
  }, [refresh]);

  const testShortcut = async (mode: 'clipboard' | 'region') => {
    setError(null);
    setNotice(null);
    const type = mode === 'clipboard' ? TUTOR_MSG.TEST_CLIPBOARD : TUTOR_MSG.TEST_REGION;
    await appendDebugLog('ui', `test ${mode} clicked`);
    const response = (await chrome.runtime.sendMessage({ type })) as { ok?: boolean; error?: string };
    if (!response?.ok) {
      const msg = response?.error || 'Test failed.';
      await appendDebugLog('ui', msg, 'error');
      setError(msg);
      setLastRunError(msg);
      return;
    }
    await appendDebugLog('ui', `test ${mode} dispatched OK`);
    setNotice('Test started — check the web page for the HINA panel (not this side panel).');
    void readLastShortcutError().then(setLastRunError);
  };

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        setNotice(null);
        return;
      }
      const combo = shortcutFromKeyboardEvent(event);
      if (!combo) return;
      setDrafts((prev) => ({ ...prev, [recording]: combo }));
      setRecording(null);
      setNotice(`Recorded ${formatShortcutForDisplay(combo)} — click Save to apply.`);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording]);

  const save = async (name: TutorCommandName) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const shortcut = drafts[name]?.trim();
      if (!shortcut) throw new Error('Enter or record a shortcut first.');
      await updateExtensionShortcut(name, shortcut);
      const ask =
        name === TUTOR_COMMANDS.ASK_CLIPBOARD
          ? shortcut
          : drafts[TUTOR_COMMANDS.ASK_CLIPBOARD] || shortcuts[TUTOR_COMMANDS.ASK_CLIPBOARD] || '';
      const region =
        name === TUTOR_COMMANDS.CAPTURE_REGION
          ? shortcut
          : drafts[TUTOR_COMMANDS.CAPTURE_REGION] || shortcuts[TUTOR_COMMANDS.CAPTURE_REGION] || '';
      await saveShortcutBindings(ask, region);
      await refresh();
      setNotice(
        `Saved ${formatShortcutForDisplay(shortcut)}. Click the web page (not the side panel), then use the shortcut. Refresh open tabs if needed.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = async (name: TutorCommandName) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await resetExtensionShortcut(name);
      const d = defaultShortcutForCommand(name);
      const nextDrafts = { ...drafts, [name]: d };
      setDrafts(nextDrafts);
      await saveShortcutBindings(
        nextDrafts[TUTOR_COMMANDS.ASK_CLIPBOARD] || defaultShortcutForCommand(TUTOR_COMMANDS.ASK_CLIPBOARD),
        nextDrafts[TUTOR_COMMANDS.CAPTURE_REGION] || defaultShortcutForCommand(TUTOR_COMMANDS.CAPTURE_REGION)
      );
      await refresh();
      setNotice(`Reset to ${formatShortcutForDisplay(d)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const intro = (
    <p className="text-[11px] font-medium leading-snug text-slate-500">
      Defaults: <strong className="text-slate-700">Ask</strong> {pasteDefault},{' '}
      <strong className="text-slate-700">Screenshot</strong> {shotDefault}. Run on the{' '}
      <strong className="text-slate-700">web page</strong> (click the tab once).{' '}
      <a
        className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2"
        href="chrome://extensions/shortcuts"
        target="_blank"
        rel="noreferrer"
      >
        Chrome shortcuts
      </a>
    </p>
  );

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {compact ? (
        <details className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">How shortcuts work</summary>
          <div className="mt-2">{intro}</div>
        </details>
      ) : (
        intro
      )}

      {TUTOR_COMMAND_DEFS.map((def) => {
        const active = shortcuts[def.name] || defaultShortcutForCommand(def.name);
        const draft = drafts[def.name] ?? active;
        const isRec = recording === def.name;

        return (
          <div
            key={def.name}
            className={`rounded-xl border px-2.5 py-2 transition-shadow ${
              isRec ? 'border-slate-800 bg-slate-50 shadow-sm ring-2 ring-slate-800/10' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-xs font-semibold tracking-tight text-slate-900">{def.label}</p>
            {!compact && <p className="mt-0.5 text-[11px] font-medium text-slate-500">{def.hint}</p>}
            <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-1.5' : 'mt-2'}`}>
              <input
                className="ext-textarea !min-h-0 min-w-0 flex-[1_1_120px] py-1.5 font-mono text-[11px]"
                value={draft}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [def.name]: e.target.value }))}
                placeholder={defaultShortcutForCommand(def.name)}
                disabled={Boolean(busy) || isRec}
                aria-label={`Shortcut for ${def.label}`}
              />
              <button
                type="button"
                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-50 ${
                  isRec
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                }`}
                disabled={Boolean(busy)}
                onClick={() => {
                  setRecording(isRec ? null : def.name);
                  setNotice(isRec ? null : 'Press your key combination now… (Esc cancels)');
                }}
              >
                {isRec ? 'Listen…' : 'Record'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                disabled={Boolean(busy)}
                onClick={() => void save(def.name)}
              >
                {busy === def.name ? '…' : 'Save'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                disabled={Boolean(busy)}
                onClick={() => void reset(def.name)}
              >
                Reset
              </button>
            </div>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              Active: <span className="ext-kbd">{formatShortcutForDisplay(active)}</span>
            </p>
          </div>
        );
      })}

      {recording && (
        <p className="ext-notice info">
          Recording — press your combination now (include {mac ? '⌘ or Ctrl' : 'Ctrl or Alt'}). Esc cancels.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          disabled={Boolean(busy)}
          onClick={() => void testShortcut('clipboard')}
        >
          Test ask
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          disabled={Boolean(busy)}
          onClick={() => void testShortcut('region')}
        >
          Test screenshot
        </button>
      </div>
      {!compact && (
        <p className="text-[11px] font-medium leading-relaxed text-slate-500">
          Works on http/https/file pages — not <code className="rounded bg-slate-100 px-1">chrome://</code>.
        </p>
      )}
      {lastRunError && <p className="ext-notice error text-[11px]">Last error: {lastRunError}</p>}
      {notice && <p className="ext-notice success text-[11px]">{notice}</p>}
      {error && <p className="ext-notice error text-[11px]">{error}</p>}
      {compact ? (
        <details className="rounded-lg border border-slate-200 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Activity log</summary>
          <div className="mt-2">
            <ShortcutDebugLog />
          </div>
        </details>
      ) : (
        <ShortcutDebugLog />
      )}
    </div>
  );
}
