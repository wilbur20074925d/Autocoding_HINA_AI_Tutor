import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Download,
  GitBranch,
  Layers,
  Lightbulb,
  Loader2,
  Network,
  Search,
  Users,
  X,
} from 'lucide-react';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import type { AITutorChatNote, AITutorStaffSession } from '../../services/aiTutorNewService';
import { noteMessagesToRows } from '../../services/aiTutorNewService';
import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  getDimensionMeta,
  type HinaDimension,
} from '../../utils/hinaCodes';
import { interpretDiversity } from '../../utils/hinaAnalysis';
import {
  buildHinaClassAnalysis,
  classQuotesFor,
  exportHinaClassCsv,
  interpretClassDyadic,
  interpretClassMesoscale,
  interpretClassNodeLevel,
  toHinaSourceMessage,
  type HinaClassAnalysis,
  type HinaClassCodedTurn,
  type HinaClassTurn,
} from '../../utils/hinaClassAnalysis';
import {
  classClusterSlides,
  classNetworkSlides,
  classOverlaySlides,
  classPatternSlides,
  classProjectionSlides,
  classRosterSlides,
} from '../../utils/hinaClassPlots';
import type { HinaPlotSlide } from '../../utils/hinaPlots';
import { formatHinaUpdatedAgo } from '../../hooks/useLiveHinaLabelling';
import {
  HinaAnimatedPanel,
  HinaBackdrop,
  HinaChip,
  HinaInsightCard,
  HinaLiveBadge,
  HinaMetricTile,
  HinaNextButton,
  HinaPhaseBanner,
  HinaSection,
  HinaTabBar,
} from '../AITutorNew/HinaUi';

type Level = 'deploy' | 'node' | 'dyadic' | 'mesoscale';
type TimeWindow = 'all' | '7d' | '30d';
type MesoView = 'clusters' | 'projection' | 'overlay';

/** Refresh class transcripts while the teacher HINA panel is open. */
const LIVE_POLL_MS = 8000;

const MESO_VIEWS: Array<{ id: MesoView; label: string }> = [
  { id: 'clusters', label: 'Clusters' },
  { id: 'projection', label: 'Projection' },
  { id: 'overlay', label: 'Overlay' },
];

const LEVELS: Array<{
  id: Level;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'deploy',
    label: 'Deploy',
    title: 'Deploy class HINA',
    subtitle: 'Live slice: transcripts refresh every few seconds while students chat with the AI Tutor.',
    icon: BookOpen,
  },
  {
    id: 'node',
    label: 'Node-level',
    title: 'Individual quantity and diversity',
    subtitle: 'Live node-level measures — who barely uses the tutor, who only asks for answers, who plans and monitors.',
    icon: Users,
  },
  {
    id: 'dyadic',
    label: 'Dyadic',
    title: 'Significant student–code ties',
    subtitle: 'Live dyadic edges refresh as new coded turns arrive. Short profiles cannot be pruned.',
    icon: Activity,
  },
  {
    id: 'mesoscale',
    label: 'Mesoscale',
    title: 'Strategy clusters and code projection',
    subtitle: 'Live clusters and projection update from time to time as the class conversation grows.',
    icon: Layers,
  },
];

const plotConfig = { responsive: true, displayModeBar: false, displaylogo: false };

interface TeacherHinaAnalysisProps {
  sessions: AITutorStaffSession[];
  selectedIds: Set<string>;
  courseLabel?: string | null;
  loadNotes: (ids: string[]) => Promise<AITutorChatNote[]>;
  /** Optional: refresh the staff session list so newly active chats enter the slice. */
  onRefreshSessions?: () => void | Promise<void>;
  onClose: () => void;
}

export const TeacherHinaAnalysis: React.FC<TeacherHinaAnalysisProps> = ({
  sessions,
  selectedIds,
  courseLabel,
  loadNotes,
  onRefreshSessions,
  onClose,
}) => {
  const [activeLevel, setActiveLevel] = useState<Level>('deploy');
  const [mesoView, setMesoView] = useState<MesoView>('clusters');
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [pruneSignificant, setPruneSignificant] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [scope, setScope] = useState<'visible' | 'selected'>(selectedIds.size > 0 ? 'selected' : 'visible');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<HinaClassTurn[]>([]);
  const [previewQuote, setPreviewQuote] = useState<HinaClassCodedTurn | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const turnsFingerprintRef = useRef('');
  const loadNotesRef = useRef(loadNotes);
  const onRefreshSessionsRef = useRef(onRefreshSessions);
  const sessionsRef = useRef(sessions);
  const selectedIdsRef = useRef(selectedIds);
  const scopeRef = useRef(scope);
  const studentIdsRef = useRef(studentIds);
  const timeWindowRef = useRef(timeWindow);

  loadNotesRef.current = loadNotes;
  onRefreshSessionsRef.current = onRefreshSessions;
  sessionsRef.current = sessions;
  selectedIdsRef.current = selectedIds;
  scopeRef.current = scope;
  studentIdsRef.current = studentIds;
  timeWindowRef.current = timeWindow;

  const scopedSessions = useMemo(() => {
    const base =
      scope === 'selected' && selectedIds.size > 0
        ? sessions.filter((session) => selectedIds.has(session.id))
        : sessions;
    const cutoff =
      timeWindow === '7d'
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : timeWindow === '30d'
          ? Date.now() - 30 * 24 * 60 * 60 * 1000
          : 0;
    return base.filter((session) => {
      if (studentIds.length > 0 && !studentIds.includes(session.user_id)) return false;
      if (cutoff && new Date(session.updated_at).getTime() < cutoff) return false;
      return true;
    });
  }, [scope, selectedIds, sessions, studentIds, timeWindow]);

  const scopedKey = useMemo(
    () =>
      scopedSessions
        .map((session) => session.id)
        .slice()
        .sort()
        .join(','),
    [scopedSessions]
  );

  const resolveScopedSessions = () => {
    const all = sessionsRef.current;
    const selected = selectedIdsRef.current;
    const currentScope = scopeRef.current;
    const currentStudentIds = studentIdsRef.current;
    const currentWindow = timeWindowRef.current;
    const base =
      currentScope === 'selected' && selected.size > 0
        ? all.filter((session) => selected.has(session.id))
        : all;
    const cutoff =
      currentWindow === '7d'
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : currentWindow === '30d'
          ? Date.now() - 30 * 24 * 60 * 60 * 1000
          : 0;
    return base.filter((session) => {
      if (currentStudentIds.length > 0 && !currentStudentIds.includes(session.user_id)) return false;
      if (cutoff && new Date(session.updated_at).getTime() < cutoff) return false;
      return true;
    });
  };

  const buildTurnsFromNotes = (notes: AITutorChatNote[], sessionList: AITutorStaffSession[]) => {
    const sessionById = new Map(sessionList.map((session) => [session.id, session]));
    const nextTurns: HinaClassTurn[] = [];
    notes.forEach((note) => {
      const session = sessionById.get(note.id);
      if (!session) return;
      noteMessagesToRows(note).forEach((row) => {
        const message = toHinaSourceMessage(row);
        if (!message) return;
        nextTurns.push({
          studentId: session.user_id,
          studentName: session.user_name,
          sessionId: session.id,
          sessionTitle: session.title,
          sessionUpdatedAt: session.updated_at,
          message,
          stage: row.metadata?.detectedStage,
          messageRole: row.metadata?.messageRole,
        });
      });
    });
    return nextTurns;
  };

  const fingerprintTurns = (nextTurns: HinaClassTurn[]) =>
    nextTurns.map((turn) => `${turn.sessionId}:${turn.message.id}:${turn.message.content.length}`).join('|');

  const loadClassTurns = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      if (onRefreshSessionsRef.current) {
        await onRefreshSessionsRef.current();
      }
      const scoped = resolveScopedSessions();
      const ids = scoped.map((session) => session.id);
      const notes = await loadNotesRef.current(ids);
      const nextTurns = buildTurnsFromNotes(notes, sessionsRef.current);
      const nextFingerprint = fingerprintTurns(nextTurns);
      if (nextFingerprint !== turnsFingerprintRef.current) {
        turnsFingerprintRef.current = nextFingerprint;
        setTurns(nextTurns);
      }
      setLastUpdatedAt(Date.now());
    } catch (loadError) {
      console.error('Failed to load HINA class transcripts:', loadError);
      setError('Could not load class transcripts for HINA.');
      if (!silent) setTurns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const bootedRef = useRef(false);
  // Reload when the teacher changes scope / window / student filters.
  useEffect(() => {
    const silent = bootedRef.current;
    bootedRef.current = true;
    void loadClassTurns({ silent });
  }, [loadClassTurns, scopedKey, scope, timeWindow, studentIds]);

  // Keep node / dyadic / mesoscale in sync while students chat.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadClassTurns({ silent: true });
    }, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadClassTurns]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (previewQuote) {
        setPreviewQuote(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, previewQuote]);

  const analysis = useMemo(() => buildHinaClassAnalysis(turns), [turns]);
  const visibleEdges = useMemo(
    () => (pruneSignificant ? analysis.classEdges.filter((edge) => edge.significant) : analysis.classEdges),
    [analysis.classEdges, pruneSignificant]
  );

  const selectedStudent = analysis.students.find((row) => row.userId === selectedStudentId);
  const selectedCode = selectedCodeId ? HINA_CODE_BY_ID[selectedCodeId] : undefined;
  const quotes = classQuotesFor(analysis, { codeId: selectedCodeId, studentId: selectedStudentId }).slice(0, 12);
  const currentLevel = LEVELS.find((level) => level.id === activeLevel) ?? LEVELS[0];
  const LevelIcon = currentLevel.icon;
  const nodeReading = useMemo(() => interpretClassNodeLevel(analysis), [analysis]);
  const dyadReading = useMemo(() => interpretClassDyadic(analysis), [analysis]);
  const mesoReading = useMemo(() => interpretClassMesoscale(analysis), [analysis]);

  const studentOptions = useMemo(() => {
    const byId = new Map<string, string>();
    sessions.forEach((session) => {
      if (!byId.has(session.user_id)) byId.set(session.user_id, session.user_name);
    });
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);

  const handlePlotClick = (event: { points?: Array<{ customdata?: unknown }> }) => {
    const raw = event.points?.[0]?.customdata;
    const token = Array.isArray(raw) ? raw[0] : raw;
    if (typeof token !== 'string') return;
    if (token.startsWith('code:') && HINA_CODE_BY_ID[token.slice(5)]) {
      setSelectedCodeId(token.slice(5));
      return;
    }
    if (token.startsWith('student:')) {
      setSelectedStudentId(token.slice(8));
    }
  };

  const handleExportCsv = () => {
    const csv = exportHinaClassCsv(analysis);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hina-class-codes.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const slides = useMemo(() => {
    if (activeLevel === 'node') return classRosterSlides(analysis);
    if (activeLevel === 'dyadic') {
      return [...classNetworkSlides(analysis, visibleEdges), ...classPatternSlides(analysis, visibleEdges)];
    }
    if (activeLevel === 'mesoscale') {
      if (mesoView === 'projection') return classProjectionSlides(analysis);
      if (mesoView === 'overlay') return classOverlaySlides(analysis);
      return classClusterSlides(analysis);
    }
    return classNetworkSlides(analysis, visibleEdges);
  }, [activeLevel, analysis, visibleEdges, mesoView]);

  const ready = !loading && !error && analysis.students.length > 0;
  const levelIndex = LEVELS.findIndex((level) => level.id === activeLevel) + 1;

  return (
    <HinaBackdrop
      onClose={() => (previewQuote ? setPreviewQuote(null) : onClose())}
      labelledBy="hina-teacher-title"
    >
        <header className="relative shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4 px-4 pt-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 shadow-sm transition-transform hover:scale-105">
                <Network className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Three-level HINA · teacher face
                </p>
                <h3 id="hina-teacher-title" className="text-base font-bold tracking-tight text-slate-900">
                  Class interaction analysis
                </h3>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HinaLiveBadge
                busy={refreshing || loading}
                updatedLabel={formatHinaUpdatedAgo(lastUpdatedAt, clock)}
                title="Node, dyadic, and mesoscale views refresh while students chat"
              />
              <button
                type="button"
                onClick={() => void loadClassTurns({ silent: true })}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-all hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:opacity-50"
              >
                <Loader2 className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={analysis.codedCount === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-all hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Codes CSV
              </button>
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

          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-2">
            <span className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium leading-snug tracking-tight text-slate-600 transition-transform hover:scale-[1.02]">
              {courseLabel || 'All visible sessions'}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600">
              {studentIds.length > 0
                ? `${studentIds.length} student${studentIds.length === 1 ? '' : 's'} selected`
                : 'All students'}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600">
              Local codebook · auto every {LIVE_POLL_MS / 1000}s
            </span>
          </div>

          {!loading && analysis.students.length > 0 && (
            <dl className="grid grid-cols-2 divide-y divide-slate-200 border-t border-slate-200 bg-slate-50 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <MiniStat label="Students" value={String(analysis.students.length)} />
              <MiniStat label="Coded turns" value={String(analysis.codedCount)} />
              <MiniStat
                label="Class diversity"
                value={interpretDiversity(
                  analysis.students.reduce((sum, row) => sum + row.diversity, 0) / Math.max(1, analysis.students.length)
                ).label}
              />
              <MiniStat label="Clusters" value={String(analysis.clusters.length)} />
            </dl>
          )}

          <HinaTabBar
            items={LEVELS.map((level) => ({
              id: level.id,
              label: level.label,
              icon: level.icon,
              disabled: level.id !== 'deploy' && !ready,
            }))}
            activeId={activeLevel}
            onChange={(id) => setActiveLevel(id as Level)}
          />
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 animate-fade-in">
              <div className="flex items-center gap-2 text-sm font-medium tracking-tight text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Coding class transcripts with the HINA codebook…
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              <p className="text-sm font-semibold tracking-tight text-slate-800">{error}</p>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <HinaPhaseBanner
                icon={LevelIcon}
                title={currentLevel.title}
                subtitle={currentLevel.subtitle}
                step={levelIndex}
                total={LEVELS.length}
                actions={
                  activeLevel !== 'mesoscale' ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeLevel === 'deploy') setActiveLevel(analysis.students.length > 0 ? 'node' : 'deploy');
                        else if (activeLevel === 'node') setActiveLevel('dyadic');
                        else setActiveLevel('mesoscale');
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-tight text-slate-700 transition-all hover:border-slate-800 hover:bg-slate-800 hover:text-white"
                    >
                      Next →
                    </button>
                  ) : null
                }
              />

              <HinaAnimatedPanel panelKey={activeLevel} className="min-h-0 flex-1 overflow-hidden">
                {activeLevel === 'deploy' ? (
                  <div className="h-full min-h-0 overflow-y-auto animate-hina-panel">
                    <DeployLevel
                      analysis={analysis}
                      scope={scope}
                      onScope={setScope}
                      selectedIds={selectedIds}
                      timeWindow={timeWindow}
                      onTimeWindow={setTimeWindow}
                      studentOptions={studentOptions}
                      studentIds={studentIds}
                      onStudentIds={setStudentIds}
                      scopedCount={scopedSessions.length}
                      onContinue={() => setActiveLevel(analysis.students.length > 0 ? 'node' : 'deploy')}
                    />
                  </div>
                ) : analysis.students.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                    <div className="px-6 text-center">
                      <p className="text-sm font-semibold tracking-tight text-slate-800">Not enough coded talk yet</p>
                      <p className="mt-1 text-xs font-medium tracking-tight text-slate-500">
                        Load sessions with student–AI messages, or widen the time window in Deploy.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 gap-3 animate-hina-panel">
                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visualization</p>
                          <p className="truncate text-xs font-semibold tracking-tight text-slate-800">
                            {activeLevel === 'node'
                              ? 'Roster plots'
                              : activeLevel === 'dyadic'
                                ? 'Class network & patterns'
                                : mesoView === 'overlay'
                                  ? 'Tutor analytics overlay'
                                  : mesoView === 'projection'
                                    ? 'Code co-occurrence'
                                    : 'Strategy clusters'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeLevel === 'mesoscale' &&
                            MESO_VIEWS.map((view) => (
                              <HinaChip
                                key={view.id}
                                active={mesoView === view.id}
                                onClick={() => setMesoView(view.id)}
                                title={view.label}
                              />
                            ))}
                          {activeLevel === 'dyadic' && (
                            <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600 transition-colors hover:border-slate-400">
                              <input
                                type="checkbox"
                                checked={pruneSignificant}
                                disabled={!analysis.pruneReady}
                                onChange={(event) => setPruneSignificant(event.target.checked)}
                                className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                              />
                              Stable only
                            </label>
                          )}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 p-2.5">
                        <PlotPager
                          key={`${activeLevel}-${mesoView}-${pruneSignificant}-${scopedKey}`}
                          slides={slides}
                          onPlotClick={handlePlotClick}
                        />
                      </div>
                    </section>

                    <aside className="flex h-full min-h-0 w-[24rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        <div className="space-y-3">
                          {activeLevel === 'node' && (
                            <NodeLevelPanel
                              analysis={analysis}
                              reading={nodeReading}
                              selectedStudentId={selectedStudentId}
                              onSelectStudent={setSelectedStudentId}
                              onContinue={() => setActiveLevel('dyadic')}
                            />
                          )}
                          {activeLevel === 'dyadic' && (
                            <DyadicLevelPanel
                              analysis={analysis}
                              reading={dyadReading}
                              edges={visibleEdges}
                              selectedCodeId={selectedCodeId}
                              selectedStudentId={selectedStudentId}
                              onSelect={(edge) => {
                                setSelectedCodeId(edge.codeId);
                                setSelectedStudentId(edge.studentId);
                              }}
                              onContinue={() => setActiveLevel('mesoscale')}
                            />
                          )}
                          {activeLevel === 'mesoscale' && (
                            <MesoscaleLevelPanel
                              analysis={analysis}
                              reading={mesoReading}
                              mesoView={mesoView}
                              onMesoView={setMesoView}
                            />
                          )}

                          <QuotePanel
                            selectedCode={selectedCode}
                            selectedStudent={selectedStudent}
                            quotes={quotes}
                            onClear={() => {
                              setSelectedCodeId(null);
                              setSelectedStudentId(null);
                            }}
                            onOpen={setPreviewQuote}
                          />
                        </div>
                      </div>
                    </aside>
                  </div>
                )}
              </HinaAnimatedPanel>
            </div>
          )}
        </div>

        {previewQuote && <QuotePreview quote={previewQuote} onClose={() => setPreviewQuote(null)} />}
    </HinaBackdrop>
  );
};

const DeployLevel: React.FC<{
  analysis: HinaClassAnalysis;
  scope: 'visible' | 'selected';
  onScope: (value: 'visible' | 'selected') => void;
  selectedIds: Set<string>;
  timeWindow: TimeWindow;
  onTimeWindow: (value: TimeWindow) => void;
  studentOptions: Array<[string, string]>;
  studentIds: string[];
  onStudentIds: (ids: string[]) => void;
  scopedCount: number;
  onContinue: () => void;
}> = ({
  analysis,
  scope,
  onScope,
  selectedIds,
  timeWindow,
  onTimeWindow,
  studentOptions,
  studentIds,
  onStudentIds,
  scopedCount,
  onContinue,
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <HinaInsightCard delayMs={0} title="Construction" body="Student–AI turns are coded with the 19-code HINA codebook into a heterogeneous interaction network." />
          <HinaInsightCard delayMs={60} title="Three levels" body="After deploy: node-level quantity/diversity, dyadic significant edges, and mesoscale clusters with projection + overlay." />
          <HinaInsightCard delayMs={120} title="Teacher only" body="Cluster labels and class networks stay on the teacher face. Students only see their own node-level view." />
        </div>

        <HinaSection eyebrow="Slice configuration" title="Who and when to include">
          <div className="grid grid-cols-2 gap-2">
            <FilterField label="Scope">
              <select
                value={scope}
                onChange={(event) => onScope(event.target.value as 'visible' | 'selected')}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold tracking-tight text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                <option value="visible">Visible sessions</option>
                <option value="selected" disabled={selectedIds.size === 0}>
                  Selected ({selectedIds.size})
                </option>
              </select>
            </FilterField>
            <FilterField label="Window">
              <select
                value={timeWindow}
                onChange={(event) => onTimeWindow(event.target.value as TimeWindow)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold tracking-tight text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </FilterField>
          </div>
          <div className="mt-3">
            <StudentMultiPicker options={studentOptions} selectedIds={studentIds} onChange={onStudentIds} />
          </div>
        </HinaSection>
      </div>

      <div className="space-y-3">
        <HinaSection eyebrow="Deployment status" title="Ready for analysis">
          <div className="grid grid-cols-2 gap-2">
            <HinaMetricTile label="Sessions in slice" value={String(scopedCount)} hint="After scope, window, and student filters." delayMs={0} />
            <HinaMetricTile label="Coded turns" value={String(analysis.codedCount)} hint="Local codebook applied client-side." delayMs={40} />
            <HinaMetricTile label="Students" value={String(analysis.students.length)} hint="Learners with at least one coded turn." delayMs={80} />
            <HinaMetricTile
              label="Prune ready"
              value={analysis.pruneReady ? 'Yes' : 'Not yet'}
              hint="Dyadic significance needs enough coded talk."
              delayMs={120}
            />
          </div>
          <p className="mt-3 text-[11px] font-medium tracking-tight text-slate-500">
            Live mode refreshes this slice every few seconds while students chat with the AI Tutor.
          </p>
          <div className="mt-4">
            <HinaNextButton label="Continue to node-level" onClick={onContinue} disabled={analysis.students.length === 0} />
          </div>
        </HinaSection>

        <HinaInsightCard
          title="HINA workflow"
          body="1 Deploy → 2 Node-level → 3 Dyadic → 4 Mesoscale (clusters, projection, overlay). All levels stay live."
          icon={<Lightbulb className="h-3.5 w-3.5 text-slate-500" />}
        />
      </div>
    </div>
  </div>
);

const NodeLevelPanel: React.FC<{
  analysis: HinaClassAnalysis;
  reading: ReturnType<typeof interpretClassNodeLevel>;
  selectedStudentId: string | null;
  onSelectStudent: (userId: string) => void;
  onContinue: () => void;
}> = ({ analysis, reading, selectedStudentId, onSelectStudent, onContinue }) => (
  <>
    <HinaInsightCard title="Interpretation" body={reading.summary} />
    <p className="text-[11px] font-medium leading-relaxed tracking-tight text-slate-500">{reading.hint}</p>
    {(reading.lowEngagement.length > 0 || reading.narrowStrategy.length > 0 || reading.exemplars.length > 0) && (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-medium tracking-tight text-slate-600 animate-fade-in">
        {reading.lowEngagement.length > 0 && (
          <p>
            <span className="font-semibold text-slate-800">Low engagement: </span>
            {reading.lowEngagement.slice(0, 6).join(', ')}
            {reading.lowEngagement.length > 6 ? '…' : ''}
          </p>
        )}
        {reading.narrowStrategy.length > 0 && (
          <p>
            <span className="font-semibold text-slate-800">Narrow strategy: </span>
            {reading.narrowStrategy.slice(0, 6).join(', ')}
            {reading.narrowStrategy.length > 6 ? '…' : ''}
          </p>
        )}
        {reading.exemplars.length > 0 && (
          <p>
            <span className="font-semibold text-slate-800">Exemplars: </span>
            {reading.exemplars.join(', ')}
          </p>
        )}
      </div>
    )}
    <StudentMiniList
      students={analysis.students}
      selectedStudentId={selectedStudentId}
      onSelect={onSelectStudent}
    />
    <HinaNextButton label="Continue to dyadic" onClick={onContinue} />
  </>
);

const DyadicLevelPanel: React.FC<{
  analysis: HinaClassAnalysis;
  reading: ReturnType<typeof interpretClassDyadic>;
  edges: HinaClassAnalysis['classEdges'];
  selectedCodeId: string | null;
  selectedStudentId: string | null;
  onSelect: (edge: HinaClassAnalysis['classEdges'][number]) => void;
  onContinue: () => void;
}> = ({ analysis, reading, edges, selectedCodeId, selectedStudentId, onSelect, onContinue }) => (
  <>
    <HinaInsightCard title="Interpretation" body={reading.summary} />
    <p className="text-[11px] font-medium leading-relaxed tracking-tight text-slate-500">{reading.hint}</p>
    {!analysis.pruneReady && (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-medium tracking-tight text-slate-500">
        Short class slices produce few or no stable edges. That is a sample-size warning, not missing data.
      </p>
    )}
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
    {HINA_DIMENSIONS.map((dimension) => (
      <CodeChips
        key={dimension.id}
        dimension={dimension.id}
        edges={edges}
        selectedCodeId={selectedCodeId}
        onSelect={(codeId) => {
          const edge = edges.find((item) => item.codeId === codeId);
          if (edge) onSelect(edge);
        }}
      />
    ))}
    <PatternList
      edges={edges}
      selectedCodeId={selectedCodeId}
      selectedStudentId={selectedStudentId}
      onSelect={onSelect}
    />
    <HinaNextButton label="Continue to mesoscale" onClick={onContinue} />
  </>
);

const MesoscaleLevelPanel: React.FC<{
  analysis: HinaClassAnalysis;
  reading: ReturnType<typeof interpretClassMesoscale>;
  mesoView: MesoView;
  onMesoView: (view: MesoView) => void;
}> = ({ analysis, reading, mesoView, onMesoView }) => (
  <>
    <div className="flex flex-wrap gap-1">
      {MESO_VIEWS.map((view) => (
        <HinaChip
          key={view.id}
          active={mesoView === view.id}
          onClick={() => onMesoView(view.id)}
          title={view.label}
        />
      ))}
    </div>
    <HinaInsightCard title="Interpretation" body={reading.summary} />
    <p className="text-[11px] font-medium leading-relaxed tracking-tight text-slate-500">{reading.hint}</p>
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-all hover:border-slate-300 hover:bg-white">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-800">
        <GitBranch className="h-3.5 w-3.5" />
        Course-design note
      </p>
      <p className="mt-1 text-[11px] font-medium leading-relaxed tracking-tight text-slate-600">{reading.designNote}</p>
    </div>
    {mesoView === 'overlay' && (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-medium tracking-tight text-slate-600 animate-fade-in">
        Request → provide loops:{' '}
        <span className="font-semibold text-slate-800">{analysis.overlay.requestProvidePairs}</span>
        . Stages and roles sit next to HINA codes — they are not the same coding.
      </div>
    )}
    <div className="space-y-2">
      {analysis.clusters.map((cluster, index) => (
        <div
          key={cluster.id}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md animate-fade-in-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold tracking-tight text-slate-900">{cluster.label}</p>
            <p className="text-[11px] font-semibold tabular-nums text-slate-500">{cluster.studentIds.length}</p>
          </div>
          <p className="mt-1 text-[11px] font-medium tracking-tight text-slate-600">{cluster.hint}</p>
          <p className="mt-1.5 text-[11px] font-semibold tracking-tight text-slate-700">{cluster.action}</p>
        </div>
      ))}
    </div>
  </>
);

const QuotePanel: React.FC<{
  selectedCode?: (typeof HINA_CODE_BY_ID)[string];
  selectedStudent?: HinaClassAnalysis['students'][number];
  quotes: HinaClassCodedTurn[];
  onClear: () => void;
  onOpen: (quote: HinaClassCodedTurn) => void;
}> = ({ selectedCode, selectedStudent, quotes, onClear, onOpen }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {selectedCode ? getDimensionMeta(selectedCode.dimension).label : selectedStudent ? 'Student' : 'Quotes'}
        </p>
        <h4 className="text-xs font-semibold tracking-tight text-slate-900">
          {selectedCode?.label || selectedStudent?.name || 'Click a code or student'}
        </h4>
        <p className="mt-0.5 text-[11px] font-medium tracking-tight text-slate-500">
          {selectedCode?.prompt || 'Select a move or name to read original turns.'}
        </p>
      </div>
      {(selectedCode || selectedStudent) && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
    <div className="space-y-1.5 p-2.5">
      {quotes.length === 0 ? (
        <p className="text-xs font-medium tracking-tight text-slate-500">
          {selectedCode || selectedStudent ? 'No matching turns in this slice.' : 'Click the plot or the lists to inspect turns.'}
        </p>
      ) : (
        quotes.map((quote) => (
          <button
            key={`${quote.messageId}-${quote.sessionId}`}
            type="button"
            onClick={() => onOpen(quote)}
            className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                {quote.studentName} · {quote.actor === 'me' ? 'Student' : 'Tutor'}
              </p>
              <p className="mt-0.5 line-clamp-3 text-xs font-medium tracking-tight">{quote.excerpt}</p>
            </div>
            <span className="shrink-0 text-[10px] font-semibold">Open</span>
          </button>
        ))
      )}
    </div>
  </div>
);

const QuotePreview: React.FC<{
  quote: HinaClassCodedTurn;
  onClose: () => void;
}> = ({ quote, onClose }) => {
  const code = HINA_CODE_BY_ID[quote.codeId];
  const dimension = code ? getDimensionMeta(code.dimension) : null;
  const speaker = quote.actor === 'me' ? 'Student' : 'Tutor';

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[82%] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hina-quote-title"
      >
        <div className="shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-slate-600">
              {speaker} turn
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close turn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-start gap-3 px-5 pb-4 pt-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-sm font-bold text-white">
              {studentInitials(quote.studentName)}
            </div>
            <div className="min-w-0 flex-1">
              <h4 id="hina-quote-title" className="text-base font-bold leading-snug tracking-tight text-slate-900">
                {quote.studentName}
              </h4>
              <p className="mt-1 text-xs font-medium leading-relaxed tracking-tight text-slate-500">
                {quote.sessionTitle || 'AI Tutor session'}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3">
            <div className="bg-slate-50 px-5 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dimension</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-800">
                {dimension && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dimension.color }} />
                )}
                <span className="min-w-0 break-words">{dimension?.label || '—'}</span>
              </dd>
            </div>
            <div className="bg-slate-50 px-5 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Code</dt>
              <dd className="mt-1 text-xs font-semibold leading-snug tracking-tight text-slate-800">
                {code?.label || '—'}
              </dd>
            </div>
            <div className="col-span-2 bg-slate-50 px-5 py-2.5 sm:col-span-1">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stage</dt>
              <dd className="mt-1 text-xs font-semibold tracking-tight text-slate-800">{quote.stage || '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <MarkdownRenderer content={quote.content || quote.excerpt} variant="chat" className="text-sm" />
          </div>
          {code?.prompt && (
            <p className="mt-3 text-xs font-medium leading-relaxed tracking-tight text-slate-500">{code.prompt}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const FilterField: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({
  label,
  className = '',
  children,
}) => (
  <label className={`flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
    {label}
    {children}
  </label>
);

const studentInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const StudentMultiPicker: React.FC<{
  options: Array<[string, string]>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ options, selectedIds, onChange }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const selected = new Set(selectedIds);
  const allSelected = selectedIds.length === 0;
  const visible = options.filter(([, name]) => {
    const q = query.trim().toLowerCase();
    return !q || name.toLowerCase().includes(q);
  });
  const selectedOptions = options.filter(([id]) => selected.has(id));

  const toggle = (id: string) => {
    if (allSelected) {
      onChange([id]);
      return;
    }
    if (selected.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:bg-slate-100 ${
          open ? 'border-b border-slate-200' : ''
        }`}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
          <p className="truncate text-xs font-semibold tracking-tight text-slate-900">
            {allSelected ? `All ${options.length}` : `${selectedIds.length} selected`}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {!open && !allSelected && selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 py-2">
          {selectedOptions.slice(0, 4).map(([id, name]) => (
            <span
              key={id}
              className="inline-flex max-w-[7rem] truncate rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-white"
            >
              {name}
            </span>
          ))}
          {selectedOptions.length > 4 && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              +{selectedOptions.length - 4}
            </span>
          )}
        </div>
      )}

      {open && (
        <>
          <div className="flex items-center justify-end gap-1 border-b border-slate-200 px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight transition-colors ${
                allSelected
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-600 hover:bg-slate-700 hover:text-white'
              }`}
            >
              All
            </button>
            {query.trim() && visible.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([...new Set([...selectedIds, ...visible.map(([id]) => id)])])}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-tight text-slate-600 transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
              >
                Add shown
              </button>
            )}
          </div>

          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search students"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs font-medium tracking-tight text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {!allSelected && selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/70 px-2 py-2">
              {selectedOptions.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-800 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-white transition-colors hover:bg-slate-700"
                  title={`Remove ${name}`}
                >
                  <span className="truncate">{name}</span>
                  <X className="h-3 w-3 shrink-0 opacity-80" />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-44 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] font-medium tracking-tight text-slate-500">
                No students match this search.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {visible.map(([id, name]) => {
                  const active = allSelected || selected.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className={`group flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                        active && !allSelected
                          ? 'bg-slate-800 text-white'
                          : 'bg-white text-slate-800 hover:bg-slate-700 hover:text-white'
                      }`}
                      aria-pressed={active && !allSelected}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          active && !allSelected ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {studentInitials(name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight">{name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const CodeChips: React.FC<{
  dimension: HinaDimension;
  edges: HinaClassAnalysis['classEdges'];
  selectedCodeId: string | null;
  onSelect: (codeId: string) => void;
}> = ({ dimension, edges, selectedCodeId, onSelect }) => {
  const meta = getDimensionMeta(dimension);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        {meta.label}
      </p>
      <div className="flex flex-wrap gap-1">
        {HINA_CODES.filter((code) => code.dimension === dimension).map((code) => {
          const weight = edges.filter((edge) => edge.codeId === code.id).reduce((sum, edge) => sum + edge.weight, 0);
          if (weight === 0) return null;
          const active = selectedCodeId === code.id;
          return (
            <HinaChip
              key={code.id}
              active={active}
              onClick={() => onSelect(code.id)}
              title={code.shortLabel}
              meta={String(weight)}
            />
          );
        })}
      </div>
    </div>
  );
};

const StudentMiniList: React.FC<{
  students: HinaClassAnalysis['students'];
  selectedStudentId: string | null;
  onSelect: (userId: string) => void;
}> = ({ students, selectedStudentId, onSelect }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="divide-y divide-slate-200">
      {students.slice(0, 12).map((row) => {
        const active = selectedStudentId === row.userId;
        return (
          <button
            key={row.userId}
            type="button"
            onClick={() => onSelect(row.userId)}
            className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
              active ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold tracking-tight">{row.name}</span>
              <span className={`text-[10px] font-medium ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                {row.diversityLabel} · {row.clusterLabel}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums">{row.quantity}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const PatternList: React.FC<{
  edges: HinaClassAnalysis['classEdges'];
  selectedCodeId: string | null;
  selectedStudentId: string | null;
  onSelect: (edge: HinaClassAnalysis['classEdges'][number]) => void;
}> = ({ edges, selectedCodeId, selectedStudentId, onSelect }) => {
  const rows = edges.slice().sort((a, b) => b.weight - a.weight || a.pValue - b.pValue).slice(0, 16);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-semibold tracking-tight text-slate-800">No coded ties in this slice.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="divide-y divide-slate-200">
        {rows.map((edge) => {
          const code = HINA_CODE_BY_ID[edge.codeId];
          if (!code) return null;
          const active = selectedCodeId === edge.codeId && selectedStudentId === edge.studentId;
          return (
            <button
              key={`${edge.studentId}-${edge.codeId}`}
              type="button"
              onClick={() => onSelect(edge)}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
                active ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold tracking-tight">{edge.studentName}</span>
                <span className={`text-[10px] font-medium ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                  {code.shortLabel}
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
  <div className="min-w-0 px-4 py-2.5 transition-colors hover:bg-white">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="truncate text-sm font-bold tracking-tight text-slate-900">{value}</dd>
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
              key={`${item.title}-${dotIndex}`}
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
