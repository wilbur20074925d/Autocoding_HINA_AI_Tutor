import { useEffect, useState, type KeyboardEvent } from 'react';
import { ClipboardPaste, Crop, HelpCircle, Keyboard, Send, Zap } from 'lucide-react';
import { isMacPlatform } from '../lib/extensionCommands';
import { TUTOR_MSG } from '../shared/tutorMessages';
import { SetupTinyPage } from './SetupTinyPage';

interface TutorAskSectionProps {
  disabled?: boolean;
  onAnswered?: () => void;
  onAskStart?: (question: string) => void;
  prefillQuestion?: string;
  onPrefillConsumed?: () => void;
}

export function TutorAskSection({
  disabled,
  onAnswered,
  onAskStart,
  prefillQuestion,
  onPrefillConsumed,
}: TutorAskSectionProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const mac = isMacPlatform();

  const askShortcut = mac ? '⌃W' : 'Ctrl+W';
  const copyShortcut = mac ? '⌘C' : 'Ctrl+C';
  const shotShortcut = mac ? '⌃⇧W' : 'Ctrl+Shift+W';

  useEffect(() => {
    if (!prefillQuestion?.trim()) return;
    setText(prefillQuestion);
    onPrefillConsumed?.();
  }, [prefillQuestion, onPrefillConsumed]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    setBusy(true);
    setError(null);
    onAskStart?.(question);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: TUTOR_MSG.ASK_TEXT,
        text: question,
      })) as { ok?: boolean; assistant?: string; error?: string };
      if (!response?.ok) throw new Error(response?.error || 'Tutor request failed.');
      setText('');
      onAnswered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pasteAndAsk = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
      await ask(clip);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read clipboard. Paste with Ctrl+V into the box, then send.'
      );
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !busy && text.trim()) void ask(text);
    }
  };

  return (
    <>
      <div className="ext-chat-composer-main">
        <textarea
          className="ext-chat-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Ask the tutor…"
          rows={2}
          disabled={disabled || busy}
        />
        <div className="ext-chat-composer-actions">
          <button
            type="button"
            className="ext-chat-composer-help"
            onClick={() => setHelpOpen(true)}
            aria-label="How to ask the tutor"
            title="How to ask from any page"
          >
            <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="ext-chat-composer-secondary"
            disabled={disabled || busy}
            onClick={() => void pasteAndAsk()}
            title="Paste from clipboard and ask"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
            <span>Paste &amp; ask</span>
          </button>
          <button
            type="button"
            className="ext-chat-composer-send"
            disabled={disabled || busy || !text.trim()}
            onClick={() => void ask(text)}
            title="Send to tutor"
          >
            {busy ? (
              <span className="ext-spinner !h-3.5 !w-3.5 !border-2 !border-white/30 !border-t-white" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{busy ? 'Asking…' : 'Ask'}</span>
          </button>
        </div>
      </div>

      {error && <p className="ext-notice error mt-2 px-0.5">{error}</p>}

      {helpOpen && (
        <SetupTinyPage eyebrow="Help" title="Ask from any page" onClose={() => setHelpOpen(false)}>
          <div className="space-y-2.5">
            <p className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 text-center text-[11px] font-medium leading-relaxed text-slate-600">
              Three ways to send a question to your active chat — from any tab.
            </p>

            <div className="ext-setup-list-panel">
              <div className="ext-setup-list-panel-header">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <Zap className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Highlight &amp; ask</p>
                    <p className="text-[10px] font-medium text-slate-500">Recommended</p>
                  </div>
                </div>
                <span className="ext-kbd">{askShortcut}</span>
              </div>
              <p className="px-3 py-2.5 text-[11px] font-medium leading-relaxed text-slate-600">
                Select the question on any webpage, then press the shortcut. HINA sends the selection to this chat — no
                copy step.
              </p>
            </div>

            <div className="ext-setup-list-panel">
              <div className="ext-setup-list-panel-header">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <p className="text-xs font-semibold text-slate-900">Type or paste</p>
                </div>
                <span className="ext-kbd">{copyShortcut}</span>
              </div>
              <ul className="space-y-1.5 px-3 pb-2.5 pt-0 text-[11px] font-medium leading-relaxed text-slate-600">
                <li className="flex gap-2">
                  <span className="ext-help-step-num">1</span>
                  <span>Copy with {copyShortcut} if nothing is highlighted.</span>
                </li>
                <li className="flex gap-2">
                  <span className="ext-help-step-num">2</span>
                  <span>
                    Use the composer below, or tap <strong className="text-slate-800">Paste &amp; ask</strong>.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="ext-help-step-num">3</span>
                  <span>
                    <span className="ext-kbd">Enter</span> to send · <span className="ext-kbd">Shift+Enter</span> new
                    line
                  </span>
                </li>
              </ul>
            </div>

            <div className="ext-setup-list-panel">
              <div className="ext-setup-list-panel-header">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Crop className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <p className="text-xs font-semibold text-slate-900">Screenshot region</p>
                </div>
                <span className="ext-kbd">{shotShortcut}</span>
              </div>
              <p className="px-3 py-2.5 text-[11px] font-medium leading-relaxed text-slate-600">
                Drag a region on the page. The crop preview and image show in the on-page tutor overlay. For PDFs,
                select inside that preview.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <Keyboard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <p className="text-[11px] font-medium leading-relaxed text-slate-500">
                Replies sync here and in the web app. Change shortcuts under{' '}
                <strong className="text-slate-700">Setup → Keys</strong>.
              </p>
            </div>
          </div>
        </SetupTinyPage>
      )}
    </>
  );
}
