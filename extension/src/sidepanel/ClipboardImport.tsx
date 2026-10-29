import { useState } from 'react';
import { runClipboardImport } from '../services/clipboardImportRunner';

interface ClipboardImportProps {
  disabled?: boolean;
  onImported?: () => void;
  compact?: boolean;
}

export function ClipboardImport({ disabled, onImported, compact = false }: ClipboardImportProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = async (raw: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runClipboardImport(raw);
      setNotice(`Imported ${result.turnCount} turns into the selected chat session.`);
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
      await runImport(clip);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not read clipboard. Paste into the box below and click Import.'
      );
    }
  };

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {!compact && (
        <p className="text-xs font-medium leading-relaxed text-slate-500">
          Paste a <strong className="text-slate-700">ChatGPT share link</strong> or full{' '}
          <strong className="text-slate-700">copied transcript</strong> to archive into this session.
        </p>
      )}
      <textarea
        className={`ext-textarea ${compact ? 'min-h-[72px] text-[13px]' : 'min-h-[140px]'}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share URL or transcript…"
        rows={compact ? 3 : 6}
        disabled={disabled || busy}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          disabled={disabled || busy}
          onClick={() => void onPasteFromClipboard()}
        >
          From clipboard
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || busy || !text.trim()}
          onClick={() => void runImport(text)}
        >
          Import
        </button>
      </div>
      {notice && <p className="ext-notice success">{notice}</p>}
      {error && <p className="ext-notice error">{error}</p>}
    </div>
  );
}
