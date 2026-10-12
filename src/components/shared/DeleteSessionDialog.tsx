import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';

export type DeleteSessionPhase = 'confirm' | 'success';

type DeleteSessionDialogProps = {
  sessionTitle: string;
  description: string;
  note?: ReactNode;
  error?: string | null;
  busy?: boolean;
  phase?: DeleteSessionPhase;
  successDetail?: string;
  confirmLabel?: string;
  dismissLabel?: string;
  eyebrow?: string;
  onConfirm: () => void;
  onDismiss: () => void;
};

const GUINEA_PIG_SRC = '/images/guinea_pig_please_dont_delete.gif';

export function DeleteSessionDialog({
  sessionTitle,
  description,
  note,
  error,
  busy = false,
  phase = 'confirm',
  successDetail,
  confirmLabel = 'Delete',
  dismissLabel = 'Keep',
  eyebrow = 'Delete session',
  onConfirm,
  onDismiss,
}: DeleteSessionDialogProps) {
  const done = phase === 'success';

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onDismiss]);

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        disabled={busy}
        onClick={onDismiss}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px] animate-delete-backdrop motion-reduce:animate-none"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        className="relative w-full max-w-[46rem] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.55)] animate-delete-pop motion-reduce:animate-none"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-slate-100 blur-3xl" />
        <div key={done ? 'deleted' : 'confirm'} className="relative animate-fade-in motion-reduce:animate-none">
          {done ? (
            <div className="grid items-center gap-2 px-6 py-6 sm:grid-cols-[14rem_minmax(0,1fr)] sm:px-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Removed</p>
                <h2 id="delete-session-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  Session deleted
                </h2>
                <p className="mt-2 text-sm font-medium leading-relaxed tracking-tight text-slate-500">
                  {successDetail || `${sessionTitle} has been removed.`}
                </p>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold tracking-tight text-white transition-colors hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-[17.5rem_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center border-b border-slate-200 bg-slate-50 px-5 py-6 sm:border-b-0 sm:border-r">
                <img
                  src={GUINEA_PIG_SRC}
                  alt="A guinea pig asking you not to delete this session"
                  className="h-auto w-full max-w-[15rem] select-none animate-delete-float motion-reduce:animate-none"
                  draggable={false}
                />
                <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {eyebrow}
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Selected session
                  </p>
                  <h2
                    id="delete-session-title"
                    className="mt-0.5 truncate text-base font-bold tracking-tight text-slate-900"
                    title={sessionTitle}
                  >
                    {sessionTitle}
                  </h2>
                </div>
                <p className="text-sm font-medium leading-relaxed tracking-tight text-slate-600">{description}</p>
                {note ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium leading-relaxed tracking-tight text-slate-600 animate-delete-item motion-reduce:animate-none">
                    {note}
                  </div>
                ) : null}
                {error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-900 bg-slate-50 px-3.5 py-2.5 text-sm font-medium tracking-tight text-slate-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold tracking-tight text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {busy ? 'Deleting…' : confirmLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    disabled={busy}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold tracking-tight text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {dismissLabel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
