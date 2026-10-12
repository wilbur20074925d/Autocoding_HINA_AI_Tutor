import React from 'react';

/** Soft enter for HINA modal shell — matches StreamLearn slate dialogs. */
export const HinaBackdrop: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  labelledBy: string;
}> = ({ onClose, children, labelledBy }) => (
  <div
    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
    onClick={onClose}
  >
    <div
      className="relative flex h-[92vh] w-[96vw] max-w-[1440px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.55)] animate-scale-in motion-reduce:animate-none"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-slate-100 blur-3xl" />
      {children}
    </div>
  </div>
);

export const HinaLiveBadge: React.FC<{
  busy?: boolean;
  updatedLabel: string;
  title?: string;
}> = ({ busy, updatedLabel, title }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-emerald-800 transition-transform hover:scale-[1.02]"
    title={title}
  >
    <span className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${busy ? 'animate-pulse' : ''}`} />
    {busy ? 'Updating…' : 'Live'}
    <span className="font-medium text-emerald-700/80">· {updatedLabel}</span>
  </span>
);

export const HinaPhaseBanner: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  step: number;
  total: number;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, step, total, actions }) => (
  <div className="flex shrink-0 items-start gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 px-3.5 py-3 shadow-sm animate-fade-in-up motion-reduce:animate-none">
    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 shadow-sm transition-transform duration-300 hover:scale-105">
      <Icon className="h-4 w-4 text-white" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Step {step} / {total}
        </p>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <div className="flex gap-0.5">
          {Array.from({ length: total }).map((_, index) => (
            <span
              key={index}
              className={`h-1 rounded-full transition-all duration-300 ${
                index + 1 <= step ? 'w-4 bg-slate-800' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
      <h4 className="mt-0.5 text-sm font-semibold tracking-tight text-slate-900">{title}</h4>
      <p className="mt-0.5 text-[11px] font-medium leading-relaxed tracking-tight text-slate-500">{subtitle}</p>
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </div>
);

export const HinaTabBar: React.FC<{
  items: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
  }>;
  activeId: string;
  onChange: (id: string) => void;
}> = ({ items, activeId, onChange }) => (
  <nav className="flex justify-center gap-1 overflow-x-auto border-t border-slate-100 px-3">
    {items.map((item, index) => {
      const Icon = item.icon;
      const isActive = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          className={`group relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200 disabled:opacity-40 ${
            isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-200 ${
              isActive
                ? 'bg-slate-800 text-white scale-110'
                : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
            }`}
          >
            {index + 1}
          </span>
          <Icon className={`h-4 w-4 transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`} />
          {item.label}
          <span
            className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-800 transition-all duration-300 ${
              isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50'
            }`}
          />
        </button>
      );
    })}
  </nav>
);

export const HinaAnimatedPanel: React.FC<{
  panelKey: string;
  className?: string;
  children: React.ReactNode;
}> = ({ panelKey, className = '', children }) => (
  <div
    key={panelKey}
    className={`animate-fade-in-up motion-reduce:animate-none ${className}`}
  >
    {children}
  </div>
);

export const HinaInsightCard: React.FC<{
  title: string;
  body: string;
  delayMs?: number;
  accent?: boolean;
  icon?: React.ReactNode;
}> = ({ title, body, delayMs = 0, accent, icon }) => (
  <div
    className={`rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
      accent
        ? 'border-slate-800 bg-slate-800 text-white'
        : 'border-slate-200 bg-white text-slate-900'
    }`}
    style={{ animationDelay: `${delayMs}ms` }}
  >
    <p className={`flex items-center gap-1.5 text-sm font-semibold tracking-tight ${accent ? 'text-white' : 'text-slate-900'}`}>
      {icon}
      {title}
    </p>
    <p className={`mt-1 text-xs font-medium leading-relaxed tracking-tight ${accent ? 'text-slate-200' : 'text-slate-600'}`}>
      {body}
    </p>
  </div>
);

export const HinaMetricTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  delayMs?: number;
}> = ({ label, value, hint, delayMs = 0 }) => (
  <div
    className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 transition-all duration-300 hover:border-slate-300 hover:bg-white hover:shadow-sm animate-fade-in-up motion-reduce:animate-none"
    style={{ animationDelay: `${delayMs}ms` }}
  >
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
    {hint ? (
      <p className="mt-1 text-[11px] font-medium leading-relaxed tracking-tight text-slate-500">{hint}</p>
    ) : null}
  </div>
);

export const HinaDimensionBars: React.FC<{
  rows: Array<{ id: string; label: string; color: string; you: number; tutor: number; question?: string }>;
  onSelect?: (id: string) => void;
}> = ({ rows, onSelect }) => {
  const max = Math.max(1, ...rows.flatMap((row) => [row.you, row.tutor]));
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {rows.map((row, index) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect?.(row.id)}
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 animate-fade-in-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-800">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
              {row.label}
            </p>
            {row.question ? (
              <p className="mt-1 text-[11px] font-medium tracking-tight text-slate-500">{row.question}</p>
            ) : null}
            <div className="mt-2 space-y-1.5">
              <BarRow label="You" value={row.you} max={max} color={row.color} />
              <BarRow label="Tutor" value={row.tutor} max={max} color="#94A3B8" />
            </div>
          </div>
          <p className="shrink-0 text-xs font-semibold tabular-nums tracking-tight text-slate-700">
            {row.you}
            <span className="mx-1 text-slate-300">·</span>
            {row.tutor}
          </p>
        </button>
      ))}
    </div>
  );
};

const BarRow: React.FC<{ label: string; value: number; max: number; color: string }> = ({
  label,
  value,
  max,
  color,
}) => (
  <div className="flex items-center gap-2">
    <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }}
      />
    </div>
  </div>
);

export const HinaChip: React.FC<{
  active?: boolean;
  onClick?: () => void;
  title: string;
  meta?: string;
  delayMs?: number;
}> = ({ active, onClick, title, meta, delayMs = 0 }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border px-2.5 py-1.5 text-left transition-all duration-200 hover:-translate-y-0.5 ${
      active
        ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-600 hover:bg-slate-700 hover:text-white'
    }`}
    style={{ animationDelay: `${delayMs}ms` }}
  >
    <p className="text-[10px] font-semibold tracking-tight">{title}</p>
    {meta != null ? (
      <p className={`text-[10px] font-medium ${active ? 'text-slate-200' : 'text-slate-500'}`}>{meta}</p>
    ) : null}
  </button>
);

export const HinaSection: React.FC<{
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, action, children, className = '' }) => (
  <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
        <h4 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h4>
      </div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export const HinaNextButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white transition-all duration-200 hover:bg-slate-700 hover:shadow-md disabled:opacity-50"
  >
    {label}
    <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
  </button>
);
