import { useEffect, useState } from 'react';

const HINA_ICON = chrome.runtime.getURL('hina-icon.png');

const THINKING_STEPS = [
  { label: 'Reading your question', detail: 'Picking out the key ideas' },
  { label: 'Looking back at this chat', detail: 'Connecting to earlier turns' },
  { label: 'Drafting an explanation', detail: 'Keeping it clear and concise' },
] as const;

/** Matches web AI Tutor thinking card (compact). */
export function TutorThinkingIndicator({ compact = true }: { compact?: boolean }) {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const stepTimer = window.setInterval(
      () => setStep((current) => (current + 1) % THINKING_STEPS.length),
      2200
    );
    const elapsedTimer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(elapsedTimer);
    };
  }, []);

  const current = THINKING_STEPS[step];

  return (
    <div className="flex animate-fade-in justify-start gap-2.5">
      <div className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} relative mt-0.5 shrink-0`}>
        <div className="h-full w-full overflow-hidden rounded-full ring-1 ring-slate-200">
          <img src={HINA_ICON} alt="AI Tutor" className="h-full w-full object-cover" />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-slate-700" />
      </div>
      <div className={`min-w-0 flex-1 ${compact ? 'max-w-[calc(100%-2.25rem)]' : 'max-w-[min(92%,46rem)]'}`}>
        <div
          className="overflow-hidden rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-sm"
          role="status"
          aria-live="polite"
          aria-label="AI Tutor is preparing a reply"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800">AI Tutor</span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Working
              </span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-slate-400">{elapsed}s</span>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[13px] font-medium leading-snug text-slate-800">{current.label}</p>
            {!compact && <p className="mt-0.5 text-xs text-slate-500">{current.detail}</p>}
            <div className="mt-2 flex items-center gap-1.5">
              {THINKING_STEPS.map((item, index) => (
                <span
                  key={item.label}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    index <= step ? 'bg-slate-700' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
            <div className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
                  style={{ animationDelay: `${dot * 0.12}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
