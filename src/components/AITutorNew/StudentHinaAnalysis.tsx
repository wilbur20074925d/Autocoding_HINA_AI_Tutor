import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  Lightbulb,
  Network,
  Sparkles,
  X,
} from 'lucide-react';
import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  getDimensionMeta,
  type HinaDimension,
} from '../../utils/hinaCodes';
import {
  buildHinaProfile,
  canPruneHinaEdges,
  interpretDiversity,
  interpretDyadicPatterns,
  interpretNodeLevel,
  messagesForCode,
  type HinaEdge,
  type HinaProfile,
  type HinaSourceMessage,
} from '../../utils/hinaAnalysis';
import type { HinaLabelRow } from '../../utils/hinaLabelling';
import {
  compareSlides,
  diversitySlides,
  networkSlides,
  patternSlides,
  portraitSlides,
  type HinaPlotSlide,
} from '../../utils/hinaPlots';
import {
  formatHinaUpdatedAgo,
  useLiveHinaLabelling,
  type GeminiLabelFn,
} from '../../hooks/useLiveHinaLabelling';
import {
  HinaAnimatedPanel,
  HinaBackdrop,
  HinaChip,
  HinaDimensionBars,
  HinaInsightCard,
  HinaLiveBadge,
  HinaMetricTile,
  HinaNextButton,
  HinaPhaseBanner,
  HinaSection,
  HinaTabBar,
} from './HinaUi';

export interface HinaCompareSession {
  id: string;
  title: string;
  updatedAt: string;
}

type Phase = 'deploy' | 'visualize' | 'interpret';
type VizView = 'network' | 'portrait' | 'diversity' | 'patterns' | 'compare';

const PHASES: Array<{
  id: Phase;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'deploy',
    label: 'Deploy',
    title: 'Deploy node-level HINA',
    subtitle: 'Live coding: each new chat turn updates the network immediately, with a periodic Gemini refresh.',
    icon: BookOpen,
  },
  {
    id: 'visualize',
    label: 'Visualize',
    title: 'Visualize your interaction network',
    subtitle: 'Network, portrait, diversity, patterns, and session compare — all refresh as you chat.',
    icon: Network,
  },
  {
    id: 'interpret',
    label: 'Interpret',
    title: 'Interpret quantity and diversity',
    subtitle: 'Quantity, diversity, habitual ties, and next steps stay current while the conversation grows.',
    icon: Lightbulb,
  },
];

const VIZ_VIEWS: Array<{ id: VizView; label: string }> = [
  { id: 'network', label: 'Network' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'diversity', label: 'Diversity' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'compare', label: 'Compare' },
];

const plotConfig = { responsive: true, displayModeBar: false, displaylogo: false };

interface StudentHinaAnalysisProps {
  /** When false, labelling still runs in the background so the panel is live when opened. */
  open?: boolean;
  /** Inline layout (e.g. Chrome side panel) instead of full-screen modal. */
  embedded?: boolean;
  /** Compact chrome extension side panel — single-column, no duplicate chrome. */
  extensionPanel?: boolean;
  messages: HinaSourceMessage[];
  sessionTitle: string;
  sessions: HinaCompareSession[];
  currentSessionId: string | null;
  loadSessionMessages: (sessionId: string) => Promise<HinaSourceMessage[]>;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  geminiLabelFn?: GeminiLabelFn;
}

export const StudentHinaAnalysis: React.FC<StudentHinaAnalysisProps> = ({
  open = true,
  embedded = false,
  extensionPanel = false,
  messages,
  sessionTitle,
  sessions,
  currentSessionId,
  loadSessionMessages,
  onClose,
  onJumpToMessage,
  geminiLabelFn,
}) => {
  const [phase, setPhase] = useState<Phase>('deploy');
  const [vizView, setVizView] = useState<VizView>('network');
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [pruneSignificant, setPruneSignificant] = useState(false);
  const [compareId, setCompareId] = useState<string>('');
  const [compareProfile, setCompareProfile] = useState<HinaProfile | null>(null);
  const [weekProfile, setWeekProfile] = useState<HinaProfile | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const persistable = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
    [messages]
  );
  const { labelRows, labelSource, labelling, profile, lastUpdatedAt } = useLiveHinaLabelling(persistable, {
    enabled: true,
    geminiLabelFn,
  });
  const pruneReady = canPruneHinaEdges(profile.codedCount);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    const previous = sessions.find((session) => session.id !== currentSessionId);
    if (previous && !compareId) setCompareId(previous.id);
  }, [sessions, currentSessionId, compareId]);

  useEffect(() => {
    if (phase !== 'interpret' && vizView !== 'compare') return;
    let cancelled = false;
    const loadCompare = async () => {
      if (!compareId) {
        setCompareProfile(null);
        return;
      }
      setCompareLoading(true);
      try {
        const loaded = await loadSessionMessages(compareId);
        if (!cancelled) setCompareProfile(buildHinaProfile(loaded));
      } catch {
        if (!cancelled) setCompareProfile(null);
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    };
    void loadCompare();
    return () => {
      cancelled = true;
    };
  }, [phase, vizView, compareId, loadSessionMessages]);

  useEffect(() => {
    if (phase !== 'interpret' && vizView !== 'compare') return;
    let cancelled = false;
    const loadWeek = async () => {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = sessions
        .filter((session) => new Date(session.updatedAt).getTime() >= cutoff)
        .slice(0, 6);
      if (recent.length === 0) {
        setWeekProfile(null);
        return;
      }
      const bundles = await Promise.all(
        recent.map(async (session) => {
          if (session.id === currentSessionId) return persistable;
          try {
            return await loadSessionMessages(session.id);
          } catch {
            return [] as HinaSourceMessage[];
          }
        })
      );
      if (!cancelled) setWeekProfile(buildHinaProfile(bundles.flat()));
    };
    void loadWeek();
    return () => {
      cancelled = true;
    };
  }, [phase, vizView, sessions, currentSessionId, persistable, loadSessionMessages]);

  const visibleEdges = useMemo(
    () => (pruneSignificant ? profile.edges.filter((edge) => edge.significant) : profile.edges),
    [profile.edges, pruneSignificant]
  );

  const selectedQuotes = selectedCodeId ? messagesForCode(profile, selectedCodeId) : [];
  const selectedCode = selectedCodeId ? HINA_CODE_BY_ID[selectedCodeId] : undefined;
  const currentPhase = PHASES.find((item) => item.id === phase) ?? PHASES[0];
  const PhaseIcon = currentPhase.icon;
  const diversityMe = interpretDiversity(profile.diversityByActor.me);
  const nodeReading = interpretNodeLevel(profile);
  const dyadReading = interpretDyadicPatterns(profile.edges, pruneReady);

  const selectCodeFromPlot = (event: { points?: Array<{ customdata?: unknown }> }) => {
    const raw = event.points?.[0]?.customdata;
    const codeId = Array.isArray(raw) ? raw[0] : raw;
    if (typeof codeId === 'string' && HINA_CODE_BY_ID[codeId]) {
      setSelectedCodeId(codeId);
    }
  };

  const networkViews = useMemo(() => networkSlides(visibleEdges), [visibleEdges]);
  const portraitViews = useMemo(() => portraitSlides(profile), [profile]);
  const diversityViews = useMemo(() => diversitySlides(profile), [profile]);
  const patternViews = useMemo(
    () => patternSlides(pruneSignificant ? profile.edges.filter((edge) => edge.significant) : profile.edges),
    [profile.edges, pruneSignificant]
  );
  const compareViews = useMemo(
    () => compareSlides(profile, compareProfile, weekProfile),
    [profile, compareProfile, weekProfile]
  );
  const activeSlides =
    vizView === 'network'
      ? networkViews
      : vizView === 'portrait'
        ? portraitViews
        : vizView === 'diversity'
          ? diversityViews
          : vizView === 'patterns'
            ? patternViews
            : compareViews;

  const ready = persistable.length >= 2;
  const phaseIndex = PHASES.findIndex((item) => item.id === phase) + 1;
  const isExtensionPanel = embedded && extensionPanel;

  if (!open && !embedded) return null;

  const panel = (
    <>
      <header className="relative shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        {isExtensionPanel ? (
          <>
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <p id="hina-student-title" className="min-w-0 truncate text-[11px] font-semibold text-slate-800">
                {sessionTitle || 'This chat'}
              </p>
              <HinaLiveBadge
                busy={labelling}
                updatedLabel={formatHinaUpdatedAgo(lastUpdatedAt, clock)}
                title="Node-level HINA refreshes as you chat"
              />
            </div>
            <HinaTabBar
              dense
              items={PHASES.map((item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon,
                disabled: !ready && item.id !== 'deploy',
              }))}
              activeId={phase}
              onChange={(id) => setPhase(id as Phase)}
            />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 shadow-sm transition-transform hover:scale-105">
                  <Compass className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Node-level HINA · student face
                  </p>
                  <h3 id="hina-student-title" className="truncate text-base font-bold tracking-tight text-slate-900">
                    How you use AI
                  </h3>
                  <p className="truncate text-xs font-medium tracking-tight text-slate-600">
                    {sessionTitle || 'This chat'} · only your data
                  </p>
                </div>
              </div>

              {ready && (
                <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 lg:flex">
                  <MiniStat label="Coded turns" value={String(profile.codedCount)} />
                  <MiniStat label="Your diversity" value={diversityMe.label} />
                  <MiniStat
                    label="Your top move"
                    value={profile.topCodes.find((item) => item.actor === 'me')?.code.shortLabel || '—'}
                  />
                  <MiniStat
                    label="Labelling"
                    value={labelling ? 'Running…' : labelSource === 'gemini' ? 'Gemini' : 'Local'}
                  />
                </div>
              )}

              <div className="flex shrink-0 items-center gap-2">
                <HinaLiveBadge
                  busy={labelling}
                  updatedLabel={formatHinaUpdatedAgo(lastUpdatedAt, clock)}
                  title="Node-level HINA refreshes as you chat"
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close analysis"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <HinaTabBar
              items={PHASES.map((item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon,
                disabled: !ready && item.id !== 'deploy',
              }))}
              activeId={phase}
              onChange={(id) => setPhase(id as Phase)}
            />
          </>
        )}
      </header>

      <div className={`relative min-h-0 flex-1 overflow-hidden ${isExtensionPanel ? 'px-1.5 py-1.5' : 'p-3'}`}>
        {!ready ? (
          <EmptyState compact={isExtensionPanel} />
        ) : (
          <div className={`flex h-full min-h-0 flex-col ${isExtensionPanel ? 'gap-1.5' : 'gap-3'}`}>
            {!isExtensionPanel && (
              <HinaPhaseBanner
                icon={PhaseIcon}
                title={currentPhase.title}
                subtitle={currentPhase.subtitle}
                step={phaseIndex}
                total={PHASES.length}
                actions={
                  phase !== 'interpret' ? (
                    <button
                      type="button"
                      onClick={() => setPhase(phase === 'deploy' ? 'visualize' : 'interpret')}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-tight text-slate-700 transition-all hover:border-slate-800 hover:bg-slate-800 hover:text-white"
                    >
                      Next →
                    </button>
                  ) : null
                }
              />
            )}

            <HinaAnimatedPanel panelKey={phase} className="min-h-0 flex-1 overflow-hidden">
              {phase === 'deploy' && (
                <div
                  className={`h-full min-h-0 animate-hina-panel ${isExtensionPanel ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}
                >
                  <DeployPanel
                    compact={isExtensionPanel}
                    rows={labelRows}
                    labelling={labelling}
                    source={labelSource}
                    codedCount={profile.codedCount}
                    diversityLabel={diversityMe.label}
                    onSelectCode={(codeId) => {
                      setSelectedCodeId(codeId);
                      setPhase('visualize');
                    }}
                    onJumpToMessage={(messageId, codeId) => {
                      setSelectedCodeId(codeId);
                      onJumpToMessage(messageId);
                    }}
                    onContinue={() => setPhase('visualize')}
                  />
                </div>
              )}

              {phase === 'visualize' && (
                <div
                  className={`flex h-full min-h-0 animate-hina-panel ${isExtensionPanel ? 'flex-col gap-1.5' : 'gap-3'}`}
                >
                  <section
                    className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
                      isExtensionPanel ? 'min-h-[140px] flex-1' : 'flex-1 rounded-2xl'
                    }`}
                  >
                    <div
                      className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 ${isExtensionPanel ? 'px-2 py-1.5' : 'px-3 py-2'}`}
                    >
                      <div className="flex flex-wrap gap-1">
                        {VIZ_VIEWS.map((view) => (
                          <HinaChip
                            key={view.id}
                            active={vizView === view.id}
                            onClick={() => setVizView(view.id)}
                            title={view.label}
                          />
                        ))}
                      </div>
                      {(vizView === 'network' || vizView === 'patterns') && (
                        <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600 transition-colors hover:border-slate-400">
                          <input
                            type="checkbox"
                            checked={pruneSignificant}
                            disabled={!pruneReady}
                            onChange={(event) => setPruneSignificant(event.target.checked)}
                            className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                          />
                          Stable only
                        </label>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 p-2.5">
                      {vizView === 'compare' && compareLoading ? (
                        <div className="flex h-full items-center justify-center text-sm font-medium tracking-tight text-slate-500">
                          Loading previous session…
                        </div>
                      ) : (
                        <PlotPager
                          key={`${vizView}-${pruneSignificant}-${compareId}`}
                          slides={activeSlides}
                          onPlotClick={
                            vizView === 'compare' || vizView === 'diversity' ? undefined : selectCodeFromPlot
                          }
                        />
                      )}
                    </div>
                  </section>

                  <aside
                    className={`flex min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
                      isExtensionPanel ? 'max-h-[40%] w-full' : 'h-full w-[22rem]'
                    }`}
                  >
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                      <div className="space-y-3">
                        {vizView === 'compare' ? (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 animate-fade-in">
                            <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Previous session
                              <select
                                value={compareId}
                                onChange={(event) => setCompareId(event.target.value)}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold tracking-tight text-slate-700 focus:border-slate-400 focus:outline-none"
                              >
                                <option value="">None</option>
                                {sessions
                                  .filter((session) => session.id !== currentSessionId)
                                  .map((session) => (
                                    <option key={session.id} value={session.id}>
                                      {session.title}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <p className="text-[11px] font-medium tracking-tight text-slate-500">
                              Your history only. No classmates are shown.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {HINA_DIMENSIONS.map((dimension) => (
                                <span
                                  key={dimension.id}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition-transform hover:scale-105"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dimension.color }} />
                                  {dimension.label}
                                </span>
                              ))}
                            </div>
                            {HINA_DIMENSIONS.map((dimension, index) => (
                              <CodeChipGroup
                                key={dimension.id}
                                dimension={dimension.id}
                                edges={visibleEdges}
                                pruneSignificant={pruneSignificant}
                                selectedCodeId={selectedCodeId}
                                onSelect={setSelectedCodeId}
                                delayBase={index * 40}
                              />
                            ))}
                          </>
                        )}
                        <QuotePanel
                          selectedCode={selectedCode}
                          quotes={selectedQuotes}
                          onClear={() => setSelectedCodeId(null)}
                          onJump={onJumpToMessage}
                        />
                        {!isExtensionPanel && (
                          <HinaNextButton label="Continue to interpret" onClick={() => setPhase('interpret')} />
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
              )}

              {phase === 'interpret' && (
                <div
                  className={`h-full min-h-0 animate-hina-panel ${isExtensionPanel ? 'overflow-y-auto' : 'overflow-y-auto'}`}
                >
                  <InterpretPanel
                    profile={profile}
                    nodeReading={nodeReading}
                    dyadReading={dyadReading}
                    diversityMe={diversityMe}
                    pruneReady={pruneReady}
                    pruneSignificant={pruneSignificant}
                    onPruneChange={setPruneSignificant}
                    selectedCodeId={selectedCodeId}
                    onSelectCode={setSelectedCodeId}
                    sessions={sessions}
                    currentSessionId={currentSessionId}
                    compareId={compareId}
                    onCompareId={setCompareId}
                    compareProfile={compareProfile}
                    weekProfile={weekProfile}
                    selectedQuotes={selectedQuotes}
                    selectedCode={selectedCode}
                    onJump={onJumpToMessage}
                    onClearCode={() => setSelectedCodeId(null)}
                    onOpenCompareViz={() => {
                      setVizView('compare');
                      setPhase('visualize');
                    }}
                  />
                </div>
              )}
            </HinaAnimatedPanel>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div
        className={
          isExtensionPanel
            ? 'relative flex h-full min-h-0 flex-col overflow-hidden bg-white'
            : 'relative flex max-h-[min(420px,44vh)] min-h-[200px] flex-col overflow-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm'
        }
        role="region"
        aria-labelledby="hina-student-title"
      >
        {panel}
      </div>
    );
  }

  return (
    <HinaBackdrop onClose={onClose} labelledBy="hina-student-title">
      {panel}
    </HinaBackdrop>
  );
};

const EmptyState = ({ compact = false }: { compact?: boolean }) => (
  <div
    className={`flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 ${compact ? 'px-3 py-6' : 'rounded-2xl'}`}
  >
    <div className={`text-center ${compact ? 'max-w-[16rem]' : 'max-w-sm px-6'}`}>
      <p className={`font-semibold tracking-tight text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>
        Chat a bit more first
      </p>
      <p className={`mt-1 font-medium tracking-tight text-slate-500 ${compact ? 'text-[11px] leading-snug' : 'text-xs'}`}>
        A few student–AI turns unlock Deploy, Visualize, and Interpret.
      </p>
    </div>
  </div>
);

const DeployPanel: React.FC<{
  compact?: boolean;
  rows: HinaLabelRow[];
  labelling: boolean;
  source: 'gemini' | 'heuristic';
  codedCount: number;
  diversityLabel: string;
  onSelectCode: (codeId: string) => void;
  onJumpToMessage: (messageId: string, codeId: string) => void;
  onContinue: () => void;
}> = ({
  compact = false,
  rows,
  labelling,
  source,
  codedCount,
  diversityLabel,
  onSelectCode,
  onJumpToMessage,
  onContinue,
}) => (
  <div className={`flex h-full min-h-0 flex-col ${compact ? 'gap-1.5' : 'gap-4'}`}>
    {compact ? (
      <div className="grid shrink-0 grid-cols-3 gap-1">
        <MiniStat label="Coded" value={String(codedCount)} />
        <MiniStat label="Diversity" value={diversityLabel} />
        <MiniStat
          label="Labels"
          value={labelling ? '…' : source === 'gemini' ? 'Gemini' : 'Local'}
        />
      </div>
    ) : (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <HinaInsightCard
            delayMs={0}
            title="1 · Construction"
            body="Each turn becomes an edge between a speaker node (You / Tutor) and one of 19 interaction codes across four dimensions."
            icon={<Sparkles className="h-3.5 w-3.5 text-slate-500" />}
          />
          <HinaInsightCard
            delayMs={60}
            title="2 · Codebook"
            body="Cognitive, metacognitive, socio-emotional, and coordinative moves — the same HINA student–AI codebook."
            icon={<BookOpen className="h-3.5 w-3.5 text-slate-500" />}
          />
          <HinaInsightCard
            delayMs={120}
            title="3 · Ready for viz"
            body={`${codedCount} coded turn${codedCount === 1 ? '' : 's'} · diversity ${diversityLabel}. Open Visualize next.`}
            icon={<Network className="h-3.5 w-3.5 text-slate-500" />}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium tracking-tight text-slate-600">
              Live deployment labels every turn with dimension, code, evidence, and rationale as you chat.
              {labelling
                ? ' Gemini is refreshing the labels…'
                : source === 'gemini'
                  ? ' Latest pass coded by Gemini against this codebook.'
                  : ' Local codebook draft — Gemini refresh pending or unavailable.'}
            </p>
            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600">
              {labelling ? 'Labelling…' : source === 'gemini' ? 'Gemini' : 'Local codebook'}
            </span>
          </div>
          <HinaNextButton label="Open Visualize" onClick={onContinue} disabled={codedCount === 0} />
        </div>
      </>
    )}

    <div className={compact ? 'min-h-0 flex-1 overflow-hidden' : undefined}>
      <LabelSheet
        compact={compact}
        rows={rows}
        labelling={labelling}
        source={source}
        onSelectCode={onSelectCode}
        onJumpToMessage={onJumpToMessage}
      />
    </div>

    {compact && (
      <div className="shrink-0 pt-0.5">
        <HinaNextButton label="Open Visualize tab" onClick={onContinue} disabled={codedCount === 0} />
      </div>
    )}
  </div>
);

const InterpretPanel: React.FC<{
  profile: HinaProfile;
  nodeReading: ReturnType<typeof interpretNodeLevel>;
  dyadReading: ReturnType<typeof interpretDyadicPatterns>;
  diversityMe: ReturnType<typeof interpretDiversity>;
  pruneReady: boolean;
  pruneSignificant: boolean;
  onPruneChange: (value: boolean) => void;
  selectedCodeId: string | null;
  onSelectCode: (codeId: string) => void;
  sessions: HinaCompareSession[];
  currentSessionId: string | null;
  compareId: string;
  onCompareId: (id: string) => void;
  compareProfile: HinaProfile | null;
  weekProfile: HinaProfile | null;
  selectedQuotes: ReturnType<typeof messagesForCode>;
  selectedCode: (typeof HINA_CODE_BY_ID)[string] | undefined;
  onJump: (messageId: string) => void;
  onClearCode: () => void;
  onOpenCompareViz: () => void;
}> = ({
  profile,
  nodeReading,
  dyadReading,
  diversityMe,
  pruneReady,
  pruneSignificant,
  onPruneChange,
  selectedCodeId,
  onSelectCode,
  sessions,
  currentSessionId,
  compareId,
  onCompareId,
  compareProfile,
  weekProfile,
  selectedQuotes,
  selectedCode,
  onJump,
  onClearCode,
  onOpenCompareViz,
}) => {
  const compareDiversity = compareProfile ? interpretDiversity(compareProfile.diversityByActor.me) : null;
  const weekDiversity = weekProfile ? interpretDiversity(weekProfile.diversityByActor.me) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
      <div className="space-y-3">
        <HinaSection eyebrow="Node-level reading" title="Quantity × diversity">
          <p className="text-sm font-medium leading-relaxed tracking-tight text-slate-700">{nodeReading.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <HinaMetricTile label="Your quantity" value={String(profile.quantityByActor.me)} hint={nodeReading.quantityHint} delayMs={0} />
            <HinaMetricTile label="Your diversity" value={diversityMe.label} hint={nodeReading.diversityHint} delayMs={40} />
            <HinaMetricTile label="Tutor quantity" value={String(profile.quantityByActor.ai)} hint="How much coded tutor talk sits opposite your moves." delayMs={80} />
            <HinaMetricTile
              label="Tutor diversity"
              value={interpretDiversity(profile.diversityByActor.ai).label}
              hint={interpretDiversity(profile.diversityByActor.ai).hint}
              delayMs={120}
            />
          </div>
        </HinaSection>

        <HinaSection eyebrow="Four dimensions" title="You versus tutor">
          <HinaDimensionBars
            rows={HINA_DIMENSIONS.map((dimension) => ({
              id: dimension.id,
              label: dimension.label,
              color: dimension.color,
              you: profile.quantityByDimension.me[dimension.id] || 0,
              tutor: profile.quantityByDimension.ai[dimension.id] || 0,
              question: dimension.question,
            }))}
          />
        </HinaSection>

        <HinaSection
          eyebrow="Habitual ties"
          title="What you stably use"
          action={
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600">
              <input
                type="checkbox"
                checked={pruneSignificant}
                disabled={!pruneReady}
                onChange={(event) => onPruneChange(event.target.checked)}
                className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
              />
              Stable only
            </label>
          }
        >
          <p className="text-xs font-medium leading-relaxed tracking-tight text-slate-600">{dyadReading.summary}</p>
          <p className="mt-1 text-[11px] font-medium tracking-tight text-slate-500">{dyadReading.hint}</p>
          <div className="mt-3">
            <PatternTable
              edges={pruneSignificant ? profile.edges.filter((edge) => edge.significant) : profile.edges}
              pruneReady={pruneReady}
              pruneSignificant={pruneSignificant}
              selectedCodeId={selectedCodeId}
              onSelectCode={onSelectCode}
            />
          </div>
        </HinaSection>

        <HinaInsightCard accent title="What to try next" body={nodeReading.nextStep} icon={<Lightbulb className="h-3.5 w-3.5 text-slate-300" />} />
      </div>

      <div className="space-y-3">
        <HinaSection
          eyebrow="Across sessions"
          title="Compare with a prior chat"
          action={
            <button
              type="button"
              onClick={onOpenCompareViz}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-600 transition-all hover:border-slate-800 hover:bg-slate-800 hover:text-white"
            >
              Open charts
            </button>
          }
        >
          <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Previous session
            <select
              value={compareId}
              onChange={(event) => onCompareId(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold tracking-tight text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              <option value="">None</option>
              {sessions
                .filter((session) => session.id !== currentSessionId)
                .map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
            </select>
          </label>
          {compareProfile && compareDiversity ? (
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="This chat qty" value={String(profile.quantityByActor.me)} />
              <MiniStat label="Prior qty" value={String(compareProfile.quantityByActor.me)} />
              <MiniStat label="This diversity" value={diversityMe.label} />
              <MiniStat label="Prior diversity" value={compareDiversity.label} />
              {weekDiversity ? <MiniStat label="Week diversity" value={weekDiversity.label} /> : null}
              {weekProfile ? <MiniStat label="Week qty" value={String(weekProfile.quantityByActor.me)} /> : null}
            </dl>
          ) : (
            <p className="mt-3 text-[11px] font-medium tracking-tight text-slate-500">
              Your history only. No classmates are shown.
            </p>
          )}
        </HinaSection>

        <QuotePanel
          selectedCode={selectedCode}
          quotes={selectedQuotes}
          onClear={onClearCode}
          onJump={onJump}
        />
      </div>
    </div>
  );
};

const LabelSheet: React.FC<{
  compact?: boolean;
  rows: HinaLabelRow[];
  labelling: boolean;
  source: 'gemini' | 'heuristic';
  onSelectCode: (codeId: string) => void;
  onJumpToMessage: (messageId: string, codeId: string) => void;
}> = ({ compact = false, rows, labelling, source, onSelectCode, onJumpToMessage }) => {
  const [dimensionFilter, setDimensionFilter] = useState<'all' | HinaDimension>('all');
  const [codeFilter, setCodeFilter] = useState('all');

  const visibleRows = rows.filter((row) => {
    if (dimensionFilter !== 'all' && row.dimension !== dimensionFilter) return false;
    if (codeFilter !== 'all' && row.codeId !== codeFilter) return false;
    return true;
  });

  const codesInFilter =
    dimensionFilter === 'all'
      ? HINA_CODES
      : HINA_CODES.filter((code) => code.dimension === dimensionFilter);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? 'h-full min-h-0' : 'rounded-2xl'}`}
    >
      <div
        className={`flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-800 ${compact ? 'px-2 py-1.5' : 'px-4 py-2.5'}`}
      >
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white">
          Dimension
          <select
            value={dimensionFilter}
            onChange={(event) => {
              setDimensionFilter(event.target.value as 'all' | HinaDimension);
              setCodeFilter('all');
            }}
            className="rounded-lg border border-slate-500 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white focus:outline-none"
          >
            <option value="all">All</option>
            {HINA_DIMENSIONS.map((dimension) => (
              <option key={dimension.id} value={dimension.id}>
                {dimension.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white">
          Code
          <select
            value={codeFilter}
            onChange={(event) => setCodeFilter(event.target.value)}
            className="rounded-lg border border-slate-500 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white focus:outline-none"
          >
            <option value="all">All</option>
            {codesInFilter.map((code) => (
              <option key={code.id} value={code.id}>
                {code.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[11px] font-medium text-slate-300">
          {labelling ? 'Updating…' : source === 'gemini' ? 'Gemini labels' : 'Local draft'}
        </span>
      </div>

      <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[3rem_5.5rem_7.5rem_minmax(0,11rem)_1fr_1fr] lg:gap-3">
        <span>#</span>
        <span>Speaker</span>
        <span>Dimension</span>
        <span>Code</span>
        <span>Evidence</span>
        <span>Why this code</span>
      </div>

      {labelling && rows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-medium tracking-tight text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
          Labelling this chat with the current codebook…
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm font-medium tracking-tight text-slate-500">
          No turns match this dimension / code filter.
        </p>
      ) : (
        <div className={`divide-y divide-slate-200 ${compact ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
          {visibleRows.map((row) => (
            <div
              key={`${row.messageId}-${row.turn}`}
              className={`grid grid-cols-1 gap-2 lg:grid-cols-[3rem_5.5rem_7.5rem_minmax(0,11rem)_1fr_1fr] lg:items-start lg:gap-3 ${compact ? 'px-2 py-2' : 'px-4 py-3'}`}
            >
              <p className="text-xs font-semibold tabular-nums text-slate-500">#{row.turn}</p>
              <p className="text-xs font-semibold tracking-tight text-slate-800">{row.speaker}</p>
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-800">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getDimensionMeta(row.dimension).color }} />
                {row.dimensionLabel}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => onSelectCode(row.codeId)}
                  className="text-left text-sm font-semibold tracking-tight text-slate-900 underline-offset-2 hover:underline"
                >
                  {row.codeLabel}
                </button>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">{row.definition}</p>
              </div>
              <p className="text-xs font-medium leading-relaxed tracking-tight text-slate-600">“{row.evidence}”</p>
              <div>
                <p className="text-xs font-medium leading-relaxed tracking-tight text-slate-600">{row.rationale}</p>
                <button
                  type="button"
                  onClick={() => onJumpToMessage(row.messageId, row.codeId)}
                  className="mt-2 text-[11px] font-semibold tracking-tight text-slate-500 hover:text-slate-800"
                >
                  Show in chat
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CodeChipGroup: React.FC<{
  dimension: HinaDimension;
  edges: HinaEdge[];
  pruneSignificant: boolean;
  selectedCodeId: string | null;
  onSelect: (codeId: string) => void;
  delayBase?: number;
}> = ({ dimension, edges, pruneSignificant, selectedCodeId, onSelect, delayBase = 0 }) => {
  const meta = getDimensionMeta(dimension);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 transition-all duration-300 hover:border-slate-300 hover:bg-white">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        {meta.label}
      </p>
      <div className="flex flex-wrap gap-1">
        {HINA_CODES.filter((code) => code.dimension === dimension).map((code, index) => {
          const weight = edges
            .filter((edge) => edge.codeId === code.id)
            .reduce((sum, edge) => sum + edge.weight, 0);
          if (weight === 0 && pruneSignificant) return null;
          return (
            <HinaChip
              key={code.id}
              active={selectedCodeId === code.id}
              onClick={() => onSelect(code.id)}
              title={code.shortLabel}
              meta={String(weight)}
              delayMs={delayBase + index * 20}
            />
          );
        })}
      </div>
    </div>
  );
};

const QuotePanel: React.FC<{
  selectedCode?: (typeof HINA_CODE_BY_ID)[string];
  quotes: ReturnType<typeof messagesForCode>;
  onClear: () => void;
  onJump: (messageId: string) => void;
}> = ({ selectedCode, quotes, onClear, onJump }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {selectedCode ? getDimensionMeta(selectedCode.dimension).label : 'Quotes'}
        </p>
        <h4 className="text-xs font-semibold tracking-tight text-slate-900">
          {selectedCode ? selectedCode.label : 'Click a code'}
        </h4>
        <p className="mt-0.5 text-[11px] font-medium tracking-tight text-slate-500">
          {selectedCode
            ? selectedCode.prompt
            : 'Select a move in the plot or list to jump back to the original turn.'}
        </p>
      </div>
      {selectedCode && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Clear selected code"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
    <div className="space-y-1.5 p-2.5">
      {!selectedCode ? null : quotes.length === 0 ? (
        <p className="text-xs font-medium tracking-tight text-slate-500">No turns used this code in the current chat.</p>
      ) : (
        quotes.map((quote) => (
          <button
            key={quote.messageId}
            type="button"
            onClick={() => onJump(quote.messageId)}
            className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                {quote.actor === 'me' ? 'You' : 'Tutor'}
              </p>
              <p className="mt-0.5 line-clamp-3 text-xs font-medium tracking-tight">{quote.excerpt}</p>
            </div>
            <span className="shrink-0 text-[10px] font-semibold">Show</span>
          </button>
        ))
      )}
    </div>
  </div>
);

const PatternTable: React.FC<{
  edges: HinaEdge[];
  pruneReady: boolean;
  pruneSignificant: boolean;
  selectedCodeId: string | null;
  onSelectCode: (codeId: string) => void;
}> = ({ edges, pruneReady, pruneSignificant, selectedCodeId, onSelectCode }) => {
  const rows = edges.slice().sort((a, b) => b.weight - a.weight || a.pValue - b.pValue);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
        <p className="text-sm font-semibold tracking-tight text-slate-800">
          {pruneSignificant && pruneReady ? 'No stable pattern yet.' : 'No coded moves in this chat yet.'}
        </p>
        <p className="mt-1 text-xs font-medium tracking-tight text-slate-500">
          {pruneSignificant ? 'Turn the filter off to see every weighted connection.' : 'Chat a bit more, then reopen this view.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="divide-y divide-slate-200">
        {rows.map((edge) => {
          const code = HINA_CODE_BY_ID[edge.codeId];
          if (!code) return null;
          const active = selectedCodeId === edge.codeId;
          return (
            <button
              key={`${edge.actor}-${edge.codeId}`}
              type="button"
              onClick={() => onSelectCode(edge.codeId)}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-800 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold tracking-tight">{code.shortLabel}</span>
                <span className={`text-[10px] font-medium ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                  {edge.actor === 'me' ? 'You' : 'Tutor'} · {getDimensionMeta(code.dimension).label}
                  {edge.significant ? ' · stable' : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{edge.weight}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 transition-all hover:bg-white">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="truncate text-sm font-bold tracking-tight text-slate-900">{value}</p>
  </div>
);

const PlotPager: React.FC<{
  slides: HinaPlotSlide[];
  onPlotClick?: (event: { points?: Array<{ customdata?: unknown }> }) => void;
}> = ({ slides, onPlotClick }) => {
  const [index, setIndex] = useState(0);
  const [plotH, setPlotH] = useState(320);
  const plotBoxRef = useRef<HTMLDivElement>(null);
  const safeIndex = slides.length ? ((index % slides.length) + slides.length) % slides.length : 0;
  const slide = slides[safeIndex];

  useEffect(() => {
    const box = plotBoxRef.current;
    if (!box) return;
    const update = () => setPlotH(Math.max(220, Math.floor(box.clientHeight)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((current) => current - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((current) => current + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!slide) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-w-0 shrink-0 px-1">
        <p className="truncate text-sm font-semibold tracking-tight text-slate-900">
          {slide.title}
          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {safeIndex + 1} / {slides.length}
          </span>
        </p>
        <p className="truncate text-[11px] font-medium tracking-tight text-slate-500">{slide.caption}</p>
      </div>
      <div
        ref={plotBoxRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50"
      >
        <button
          type="button"
          onClick={() => setIndex((current) => current - 1)}
          className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
          aria-label="Previous plot"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIndex((current) => current + 1)}
          className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
          aria-label="Next plot"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <Plot
          data={slide.data as any}
          layout={{ ...(slide.layout as object), autosize: true, height: plotH } as any}
          config={plotConfig}
          style={{ width: '100%', height: plotH }}
          useResizeHandler
          onClick={onPlotClick as any}
        />
      </div>
      <div className="flex shrink-0 flex-nowrap items-center justify-center gap-1 overflow-x-auto px-1">
        {slides.map((item, dotIndex) => {
          const active = dotIndex === safeIndex;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => setIndex(dotIndex)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors ${
                active
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-600 hover:bg-slate-700 hover:text-white'
              }`}
              aria-label={`Show ${item.title}`}
              aria-current={active ? 'true' : undefined}
            >
              {item.title}
            </button>
          );
        })}
      </div>
    </div>
  );
};
