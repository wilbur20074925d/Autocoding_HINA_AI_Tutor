import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function SetupTinyPage({
  eyebrow = 'Setup',
  title,
  onClose,
  children,
  action,
  tall = false,
  fillContent = false,
}: {
  eyebrow?: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
  /** Taller modal for insights / dense tools */
  tall?: boolean;
  /** Child fills remaining height (no outer scroll) */
  fillContent?: boolean;
}) {
  return (
    <div
      className="ext-setup-modal-backdrop fixed inset-0 z-40 flex items-center justify-center p-3 animate-fade-in"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`ext-setup-tiny-page relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10 ${
          tall
            ? 'h-[min(680px,92vh)] max-w-[min(100%,24rem)]'
            : 'max-h-[min(560px,88vh)] max-w-[min(100%,22rem)]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'ext-setup-tiny-title' : 'ext-setup-tiny-eyebrow'}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-3 pt-4 text-center">
          <p
            id="ext-setup-tiny-eyebrow"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
          >
            {eyebrow}
          </p>
          {title ? (
            <h2 id="ext-setup-tiny-title" className="mt-0.5 text-sm font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
          ) : null}
          {action ? <div className="mt-2 flex justify-center">{action}</div> : null}
        </div>

        <div
          className={
            fillContent
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1'
              : 'ext-setup-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3'
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
