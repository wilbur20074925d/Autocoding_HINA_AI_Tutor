import { ChevronRight, GraduationCap, MessageSquare, Sparkles } from 'lucide-react';

type Step = 1 | 2 | 3;

const STEPS: Record<
  Step,
  { title: string; subtitle: string; icon: typeof GraduationCap }
> = {
  1: {
    title: 'Choose your class',
    subtitle: 'Join with a code or pick a class you are already in.',
    icon: GraduationCap,
  },
  2: {
    title: 'Pick a chat session',
    subtitle: 'Tutor answers and imports save to this session (same as the web app).',
    icon: MessageSquare,
  },
  3: {
    title: 'Ask on any page',
    subtitle: 'Use shortcuts on the active tab — replies appear in the floating panel.',
    icon: Sparkles,
  },
};

export function SetupProgress({
  hasClass,
  hasChat,
  onOpenSetup,
  embedded = false,
}: {
  hasClass: boolean;
  hasChat: boolean;
  onOpenSetup?: () => void;
  /** Renders inside the Setup card (monochrome). */
  embedded?: boolean;
}) {
  const step: Step = !hasClass ? 1 : !hasChat ? 2 : 3;
  const def = STEPS[step];
  const StepIcon = def.icon;

  if (hasClass && hasChat) {
    return (
      <button
        type="button"
        onClick={onOpenSetup}
        className={`flex w-full items-center gap-2.5 border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-300 hover:bg-slate-100 ${
          embedded
            ? 'mt-2 rounded-xl border px-2.5 py-2'
            : 'rounded-xl border px-3 py-2'
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold tracking-tight text-slate-900">
            Ready — use shortcuts on any page
          </p>
          <p className="truncate text-[10px] font-medium text-slate-500">Open Keys to review or change shortcuts</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Keys
          <ChevronRight className="h-3 w-3" aria-hidden />
        </span>
      </button>
    );
  }

  if (embedded) {
    return (
      <button
        type="button"
        onClick={onOpenSetup}
        className="mt-2 flex w-full items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 px-2.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-100"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800">
          <StepIcon className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Step {step} of 3
          </p>
          <p className="text-[11px] font-semibold tracking-tight text-slate-900">{def.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug text-slate-500">{def.subtitle}</p>
        </div>
        <span className="shrink-0 pt-0.5 text-[10px] font-semibold text-slate-600">Open</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSetup}
      className="flex w-full items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
        <StepIcon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Step {step} of 3</p>
        <p className="text-sm font-semibold tracking-tight text-slate-900">{def.title}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{def.subtitle}</p>
      </div>
      {onOpenSetup ? (
        <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700">
          Setup
        </span>
      ) : null}
    </button>
  );
}
