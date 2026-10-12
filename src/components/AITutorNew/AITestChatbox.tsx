import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Save, CheckCircle, RotateCcw, History, Target, AlertTriangle, BookOpen, Brain, Layers, HelpCircle, Activity, Search, FlaskConical, ShieldCheck, FileText, ChevronLeft, ChevronRight, BarChart3, PieChart, TrendingUp, AreaChart, ScatterChart, Sparkles, Clock, X, MessageSquare, Calendar, Clock as ClockIcon, Sparkles as SparklesIcon, Compass, Eye, Network, Hammer, RefreshCw, CheckCircle2, ArrowRight, ZoomIn, ZoomOut, Play, Pause, TrendingDown, Calculator, Settings, Info, ChevronUp, Zap, Rocket, Upload, Paperclip, Maximize2, Copy, Check, Reply, Pencil } from 'lucide-react';
import Plot from 'react-plotly.js';
import { GeminiService } from '../../services/geminiService';
import { ClaudeService } from '../../services/claudeService';
import { ZenMuxService } from '../../services/zenmuxService';
import { AITutorNewService, AITutorNewSession, AITutorNewMessage, AITutorMode, type AITutorChatNoteMessage } from '../../services/aiTutorNewService';
import { StageDetectionService, MessageAnalysisResult, UserMessage as StageUserMessage } from '../../services/stageDetectionService';
import { useActivityTracking } from '../../contexts/ActivityTrackingContext';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import { LearningProcessService } from '../../services/learningProcessService';
import { AuthService } from '../../services/authService';
import { WordCloudCanvas } from '../Student/WordCloudCanvas';
import { StudentHinaAnalysis } from './StudentHinaAnalysis';
import { buildHinaProfile, interpretDiversity, type HinaSourceMessage } from '../../utils/hinaAnalysis';
import { HINA_DIMENSIONS, type HinaDimension } from '../../utils/hinaCodes';
import { formatHinaUpdatedAgo } from '../../hooks/useLiveHinaLabelling';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  turnNumber?: number;
  detectedStage?: string;
  messageRole?: string; // The role used when generating this message
  apiUsed?: 'gemini-3' | 'gemini-2' | 'claude' | 'gpt-4' | 'grok'; // Which API was used to generate this message
  attachedFileName?: string; // File name if a file was attached with this message
}

const DEFAULT_SESSION_TITLE = 'New chat';

const isPersistableMessage = (message: Message) =>
  (message.role === 'user' || message.role === 'assistant') &&
  !message.id.startsWith('success-') &&
  !message.id.startsWith('error-') &&
  !message.content.startsWith('✅ Conversation saved') &&
  !message.content.startsWith('❌ Failed to save');

const toNoteMessages = (messages: Message[]): AITutorChatNoteMessage[] =>
  messages.filter(isPersistableMessage).map((message, index) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : new Date(message.timestamp).toISOString(),
    turnNumber: message.turnNumber || index + 1,
    metadata: {
      detectedStage: message.detectedStage,
      messageRole: message.messageRole,
      apiUsed: message.apiUsed,
      attachedFileName: message.attachedFileName,
    },
  }));

export interface ChatReportData {
  messages: Message[];
  sessionTitle: string;
  sessionId: string | null;
  aiUsageSeconds: number;
  stagePercentages: {
    'Orient': number;
    'Clarify': number;
    'Strategize': number;
    'Execute': number;
    'Monitor': number;
    'Verify': number;
    'Reflect': number;
  };
  roleUsageCounts: {
    'analyst': number;
    'experimenter': number;
    'reviewer': number;
    'summarizer': number;
  };
  questionTree: Array<{id: string, question: string, timestamp: Date, role?: string, stage?: string}>;
  detectedErrors: Array<{
    type: string;
    description: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
  }>;
  structuredEvidence: Array<{
    type: string;
    content: string;
    confidence: number;
    stage: string;
  }>;
  uncertaintyRecord: Array<{
    content: string;
    stage: string;
    confidence: number;
    timestamp: Date;
  }>;
}

type CognitiveStage = 'Orient' | 'Clarify' | 'Strategize' | 'Execute' | 'Monitor' | 'Verify' | 'Reflect';

export interface AITestChatboxMetrics {
  aiUsageSeconds: number;
  stagePercentages: Record<CognitiveStage, number>;
  roleUsageCounts: {
    analyst: number;
    experimenter: number;
    reviewer: number;
    summarizer: number;
  };
  messageCounts: {
    user: number;
    assistant: number;
  };
}

interface AITestChatboxProps {
  onGenerateReport?: (data: ChatReportData) => void;
  embedded?: boolean;
  onMetricsChange?: (metrics: AITestChatboxMetrics) => void;
  onHistoryChange?: (payload: {
    sessions: AITutorNewSession[];
    selectedSession: AITutorNewSession | null;
  }) => void;
  showLeftPanel?: boolean;
  showRightPanel?: boolean;
  isTeacher?: boolean;
  courseId?: string | null;
  courseCode?: string | null;
  /** When false, the chat stays mounted but timers and layout measurements pause. */
  isActive?: boolean;
}

const JOURNEY_STAGES = [
  { id: 'Orient', name: 'Orient', blurb: 'Set the goal and recall what you already know.', icon: Compass },
  { id: 'Clarify', name: 'Clarify', blurb: 'Name the problem and the gaps in your understanding.', icon: Eye },
  { id: 'Strategize', name: 'Strategize', blurb: 'Choose how you will work through it.', icon: Target },
  { id: 'Execute', name: 'Execute', blurb: 'Build the answer, step by step.', icon: Hammer },
  { id: 'Monitor', name: 'Monitor', blurb: 'Check progress and switch tactics if you stall.', icon: RefreshCw },
  { id: 'Verify', name: 'Verify', blurb: 'Justify the result with evidence.', icon: CheckCircle2 },
  { id: 'Reflect', name: 'Reflect', blurb: 'Carry what you learned into the next task.', icon: ArrowRight },
] as const;

const normalizeJourneyStage = (stage?: string) => {
  if (stage === 'Plan') return 'Strategize';
  return JOURNEY_STAGES.some((item) => item.id === stage) ? stage : 'Clarify';
};

const INSIGHT_PAGES = [
  { id: 'strategy', title: 'Strategy', icon: Brain },
  { id: 'journey', title: 'Journey', icon: Compass },
  { id: 'shape', title: 'Shape', icon: ScatterChart },
  { id: 'workflow', title: 'Workflow', icon: Activity },
] as const;

const QUAD_TAGS: Array<{ key: HinaDimension; label: string; short: string; angle: number }> = [
  { key: 'cognitive', label: 'Cognitive', short: 'Cog', angle: -Math.PI / 2 },
  { key: 'metacognitive', label: 'Meta', short: 'Meta', angle: 0 },
  { key: 'socio-emotional', label: 'Social', short: 'Soc', angle: Math.PI / 2 },
  { key: 'coordinative', label: 'Coord.', short: 'Coord', angle: Math.PI },
];

const InsightWorkflowChart: React.FC<{
  points: Array<{ stageIndex: number; isNow: boolean }>;
}> = ({ points }) => {
  const width = 280;
  const height = 232;
  const padL = 46;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const last = Math.max(points.length - 1, 1);
  const xAt = (index: number) => padL + (points.length <= 1 ? innerW / 2 : (index / last) * innerW);
  const yAt = (stageIndex: number) => padT + (stageIndex / 6) * innerH;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(point.stageIndex)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Thinking workflow">
      {JOURNEY_STAGES.map((stage, index) => {
        const y = yAt(index);
        return (
          <g key={stage.id}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#E2E8F0" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400" fontSize="8">
              {stage.name.slice(0, 6)}
            </text>
          </g>
        );
      })}
      {points.length > 1 && (
        <path d={path} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((point, index) => (
        <g key={`${point.stageIndex}-${index}`}>
          <circle
            cx={xAt(index)}
            cy={yAt(point.stageIndex)}
            r={point.isNow ? 5 : 3.2}
            className={point.isNow ? 'fill-slate-800' : 'fill-white'}
            stroke="#0F172A"
            strokeWidth="1.6"
          />
          {point.isNow && (
            <text x={xAt(index)} y={yAt(point.stageIndex) - 8} textAnchor="middle" className="fill-slate-800" fontSize="8" fontWeight={700}>
              Now
            </text>
          )}
        </g>
      ))}
      {points.length > 0 && (
        <>
          <text x={xAt(0)} y={height - 6} textAnchor="middle" className="fill-slate-400" fontSize="8">
            Q1
          </text>
          {points.length > 1 && (
            <text x={xAt(points.length - 1)} y={height - 6} textAnchor="middle" className="fill-slate-400" fontSize="8">
              Q{points.length}
            </text>
          )}
        </>
      )}
    </svg>
  );
};

const InsightQuadChart: React.FC<{ values: number[] }> = ({ values }) => {
  const width = 280;
  const height = 232;
  const cx = width / 2;
  const cy = height / 2 + 2;
  const radius = 72;
  const max = Math.max(...values, 1);
  const pointAt = (angle: number, magnitude: number) => [
    cx + Math.cos(angle) * radius * magnitude,
    cy + Math.sin(angle) * radius * magnitude,
  ] as const;
  const outer = QUAD_TAGS.map((tag) => pointAt(tag.angle, 1));
  const inner = QUAD_TAGS.map((tag, index) => pointAt(tag.angle, 0.18 + 0.82 * (values[index] / max)));
  const toPoints = (pts: ReadonlyArray<readonly [number, number]>) => pts.map((pt) => pt.join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Four-dimension shape">
      <polygon points={toPoints(outer)} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1.2" />
      <line x1={outer[1][0]} y1={outer[1][1]} x2={outer[3][0]} y2={outer[3][1]} stroke="#E2E8F0" strokeWidth="1" />
      <line x1={outer[0][0]} y1={outer[0][1]} x2={outer[2][0]} y2={outer[2][1]} stroke="#E2E8F0" strokeWidth="1" />
      <polygon points={toPoints(inner)} fill="rgba(15, 23, 42, 0.16)" stroke="#0F172A" strokeWidth="1.8" />
      {QUAD_TAGS.map((tag, index) => {
        const [x, y] = pointAt(tag.angle, 1.28);
        return (
          <text
            key={tag.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-600"
            fontSize="9"
            fontWeight={600}
          >
            {tag.short} {values[index]}
          </text>
        );
      })}
    </svg>
  );
};

const SessionInsightDeck: React.FC<{
  messages: Message[];
  currentPhase: string;
}> = ({ messages, currentPhase }) => {
  const currentStage = normalizeJourneyStage(currentPhase);
  const currentIndex = Math.max(0, JOURNEY_STAGES.findIndex((stage) => stage.id === currentStage));
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const [selectedDimension, setSelectedDimension] = useState<HinaDimension>('cognitive');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    setSelectedIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const userMessages = useMemo(
    () => messages.filter((msg) => msg.role === 'user' && !msg.id.startsWith('intro-')),
    [messages]
  );

  const stageCounts = useMemo(() => {
    const hasTagged = userMessages.some((msg) => msg.detectedStage);
    return JOURNEY_STAGES.map((stage) => {
      if (hasTagged) {
        return userMessages.filter((msg) => normalizeJourneyStage(msg.detectedStage) === stage.id).length;
      }
      return stage.id === currentStage ? userMessages.length : 0;
    });
  }, [userMessages, currentStage]);

  const workflowPoints = useMemo(() => {
    const hasTagged = userMessages.some((msg) => msg.detectedStage);
    return userMessages.map((msg, index) => {
      const stageId = hasTagged ? normalizeJourneyStage(msg.detectedStage) : currentStage;
      return {
        stageIndex: Math.max(0, JOURNEY_STAGES.findIndex((stage) => stage.id === stageId)),
        isNow: index === userMessages.length - 1,
      };
    });
  }, [userMessages, currentStage]);

  const hinaProfile = useMemo(
    () => buildHinaProfile(messages.filter((msg) => msg.role === 'user' || msg.role === 'assistant')),
    [messages]
  );

  useEffect(() => {
    setLastUpdatedAt(Date.now());
  }, [hinaProfile.codedCount, hinaProfile.diversityByActor.me, messages.length]);

  const diversityMe = interpretDiversity(hinaProfile.diversityByActor.me);

  const dimensionCounts = useMemo(
    () => HINA_DIMENSIONS.map((dimension) => ({
      ...dimension,
      count: hinaProfile.quantityByDimension.me[dimension.id] || 0,
    })),
    [hinaProfile]
  );

  const quadValues = QUAD_TAGS.map(
    (tag) => hinaProfile.quantityByDimension.me[tag.key] || 0
  );
  const page = INSIGHT_PAGES[pageIndex];
  const PageIcon = page.icon;
  const step = (delta: number) => {
    setPageIndex((current) => (current + delta + INSIGHT_PAGES.length) % INSIGHT_PAGES.length);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded-md border border-slate-200 bg-slate-50 p-1">
            <PageIcon className="h-3.5 w-3.5 text-slate-700" />
          </span>
          <h3 className="text-xs font-semibold text-slate-900">{page.title}</h3>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold tracking-tight text-emerald-800"
            title="Node-level HINA updates as you chat"
          >
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            Live · {formatHinaUpdatedAgo(lastUpdatedAt, clock)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Previous view"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[2.25rem] text-center text-[10px] font-medium tabular-nums text-slate-600">
            {pageIndex + 1}/4
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Next view"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-1 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
        <p className="text-[10px] font-semibold tracking-tight text-slate-600">
          Node · qty {hinaProfile.quantityByActor.me} · {diversityMe.label}
        </p>
        <p className="text-[10px] font-medium tracking-tight text-slate-500">
          Updates while you chat
        </p>
      </div>

      <div className="min-h-0 flex-1">
        {page.id === 'journey' && (
          <div className="h-full overflow-hidden rounded-lg border border-slate-200">
            <table className="h-full w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-1.5 py-1 text-center">#</th>
                  <th className="px-1.5 py-1">Stage</th>
                  <th className="w-10 px-1.5 py-1 text-right">Qs</th>
                </tr>
              </thead>
              <tbody>
                {JOURNEY_STAGES.map((stage, index) => {
                  const isNow = stage.id === currentStage;
                  const isSelected = index === selectedIndex;
                  const count = stageCounts[index];
                  const StageIcon = stage.icon;
                  return (
                    <tr
                      key={stage.id}
                      onClick={() => setSelectedIndex(index)}
                      className={`cursor-pointer border-t border-slate-100 transition-colors ${
                        isNow
                          ? 'bg-slate-800 text-white'
                          : isSelected
                            ? 'bg-slate-100'
                            : 'bg-white hover:bg-slate-50'
                      }`}
                      aria-current={isNow ? 'step' : undefined}
                    >
                      <td
                        className={`px-1.5 py-1 text-center text-[10px] font-semibold tabular-nums ${
                          isNow ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {index + 1}
                      </td>
                      <td className="px-1.5 py-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <StageIcon className={`h-3 w-3 flex-shrink-0 ${isNow ? 'text-white' : 'text-slate-500'}`} />
                          <span className={`truncate text-[11px] font-medium ${isNow ? 'text-white' : 'text-slate-800'}`}>
                            {stage.name}
                          </span>
                          {isNow && (
                            <span className="rounded-full bg-white/15 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-white">
                              Now
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-1 text-right">
                        <span className={`text-[11px] font-semibold tabular-nums ${isNow ? 'text-white' : 'text-slate-700'}`}>
                          {count}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {page.id === 'workflow' && (
          <div className="flex h-full items-center rounded-lg border border-slate-200 bg-slate-50/70 px-1">
            {workflowPoints.length === 0 ? (
              <p className="w-full text-center text-xs text-slate-500">Send a prompt to see the path.</p>
            ) : (
              <InsightWorkflowChart points={workflowPoints} />
            )}
          </div>
        )}

        {page.id === 'strategy' && (
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-1.5">
            {dimensionCounts.map((dimension) => {
              const active = dimension.id === selectedDimension;
              return (
                <button
                  key={dimension.id}
                  type="button"
                  onClick={() => setSelectedDimension(dimension.id)}
                  className={`flex flex-col justify-between rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? 'border-slate-800 bg-slate-800 text-white'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <p className={`text-xs font-medium ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {dimension.label}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums leading-none">{dimension.count}</p>
                </button>
              );
            })}
          </div>
        )}

        {page.id === 'shape' && (
          <div className="flex h-full items-center rounded-lg border border-slate-200 bg-slate-50/70">
            <InsightQuadChart values={quadValues} />
          </div>
        )}
      </div>

      <div className="mt-1.5 flex shrink-0 items-center justify-center gap-1">
        {INSIGHT_PAGES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPageIndex(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === pageIndex ? 'w-4 bg-slate-800' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
            }`}
            aria-label={item.title}
            aria-current={index === pageIndex ? 'true' : undefined}
          />
        ))}
      </div>
    </section>
  );
};

const THINKING_STEPS = [
  { label: 'Reading your question', detail: 'Picking out the key ideas' },
  { label: 'Looking back at this chat', detail: 'Connecting to earlier turns' },
  { label: 'Drafting an explanation', detail: 'Keeping it clear and concise' },
] as const;

const TutorThinkingIndicator: React.FC<{
  onCancel: () => void;
  compact?: boolean;
}> = ({ onCancel, compact = false }) => {
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
    <div className="flex justify-start gap-2.5 animate-fade-in">
      <div className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} relative mt-0.5 flex-shrink-0`}>
        <div className="h-full w-full overflow-hidden rounded-full ring-1 ring-slate-200">
          <img src="/images/icon.png" alt="AI Tutor" className="h-full w-full object-cover" />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-700 animate-pulse" />
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
          <p className="text-sm font-medium text-slate-800">{current.label}</p>
          {!compact && (
            <p className="mt-0.5 text-xs text-slate-500">{current.detail}</p>
          )}
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
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
          <div className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce"
                style={{ animationDelay: `${dot * 0.12}s` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <X className="h-3 w-3" />
            Stop
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

const TUTOR_MODE_OPTIONS: Array<{
  id: AITutorMode;
  label: string;
  shortLabel: string;
  icon: typeof MessageSquare;
}> = [
  {
    id: 'default',
    label: 'Default',
    shortLabel: 'Answer',
    icon: MessageSquare,
  },
  {
    id: 'learning',
    label: 'Learning',
    shortLabel: 'Guide',
    icon: BookOpen,
  },
];

const TutorModeToggle: React.FC<{
  value: AITutorMode;
  onChange: (mode: AITutorMode) => void;
  disabled?: boolean;
  compact?: boolean;
}> = ({ value, onChange, disabled = false, compact = false }) => {
  return (
    <div
      className={`inline-flex flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
      role="radiogroup"
      aria-label="AI tutor mode"
    >
      {TUTOR_MODE_OPTIONS.map((mode) => {
        const selected = value === mode.id;
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={`${mode.label} mode`}
            onClick={() => onChange(mode.id)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-all ${
              selected
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
            style={{ minHeight: compact ? '26px' : '28px' }}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{compact ? mode.shortLabel : mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const fallbackTitleFromMessages = (messages: Array<{ role: string; content: string }>) => {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.replace(/\s+/g, ' ').trim() || '';
  if (!firstUser) return DEFAULT_SESSION_TITLE;
  const words = firstUser.split(' ').slice(0, 8).join(' ');
  return words.length > 48 ? `${words.slice(0, 45).trim()}…` : words;
};

const nextTypedReplyLength = (full: string, from: number) => {
  if (from >= full.length) return full.length;
  const rest = full.slice(from);
  if (rest.startsWith('```')) {
    const closeIdx = rest.indexOf('```', 3);
    return closeIdx === -1 ? full.length : from + closeIdx + 3;
  }
  const word = rest.match(/^(\s*\S+\s*)/);
  if (word) return from + Math.min(word[1].length, 28);
  return from + 1;
};

const TutorSessionTitle: React.FC<{
  title: string;
  displayedTitle: string;
  isPlaceholder: boolean;
  isGenerating: boolean;
  isTyping: boolean;
  compact?: boolean;
  onRename: () => void;
}> = ({ title, displayedTitle, isPlaceholder, isGenerating, isTyping, compact = false, onRename }) => {
  const sizeClass = compact ? 'text-sm' : 'text-base';

  if (isGenerating) {
    return (
      <div className="mt-0.5 flex min-w-0 items-center gap-2" role="status" aria-live="polite">
        <h1 className={`truncate font-semibold text-slate-400 ${sizeClass}`}>Naming this chat</h1>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1 w-1 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${dot * 0.12}s` }}
            />
          ))}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRename}
      title="Rename this chat"
      className="group mt-0.5 flex max-w-full items-center gap-1.5 rounded-md text-left hover:bg-slate-50"
    >
      <h1
        className={`min-w-0 truncate font-semibold ${sizeClass} ${
          isPlaceholder ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {isTyping ? displayedTitle : title}
        {isTyping && (
          <span className="ml-0.5 inline-block h-[1em] w-[1.5px] translate-y-0.5 bg-slate-800 align-middle animate-pulse" />
        )}
      </h1>
      {!isTyping && (
        <Pencil className="h-3 w-3 flex-shrink-0 text-slate-400 transition-colors group-hover:text-slate-700" />
      )}
    </button>
  );
};

type TutorMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  turnNumber?: number;
  detectedStage?: string;
  messageRole?: string;
  apiUsed?: string;
  attachedFileName?: string;
};

const TUTOR_STAGE_META: Record<string, { icon: typeof Search; dot: string }> = {
  Orient: { icon: Compass, dot: 'bg-sky-500' },
  Clarify: { icon: Search, dot: 'bg-blue-500' },
  Plan: { icon: Target, dot: 'bg-violet-500' },
  Strategize: { icon: Target, dot: 'bg-violet-500' },
  Execute: { icon: Activity, dot: 'bg-emerald-500' },
  Monitor: { icon: Eye, dot: 'bg-amber-500' },
  Verify: { icon: CheckCircle, dot: 'bg-yellow-500' },
  Reflect: { icon: Brain, dot: 'bg-indigo-500' },
};

const TUTOR_MODEL_META: Record<string, { label: string; icon: typeof SparklesIcon }> = {
  'gemini-3': { label: 'Gemini 3', icon: SparklesIcon },
  'gemini-2': { label: 'Gemini', icon: SparklesIcon },
  claude: { label: 'Claude', icon: Brain },
  'gpt-4': { label: 'GPT-4', icon: Zap },
  grok: { label: 'Grok', icon: Rocket },
};

const TUTOR_ROLE_META: Record<string, { name: string; icon: typeof Layers }> = {
  analyst: { name: 'Analyst', icon: Layers },
  experimenter: { name: 'Experimenter', icon: FlaskConical },
  reviewer: { name: 'Reviewer', icon: ShieldCheck },
  summarizer: { name: 'Summarizer', icon: FileText },
};

const copyTextToClipboard = async (text: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const formatBubbleTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

const extractTrailingQuestion = (content: string): string | null => {
  const withoutCode = content.replace(/```[\s\S]*?```/g, '').trim();
  const lines = withoutCode.split('\n').map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last || !last.endsWith('?')) return null;
  const cleaned = last
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/\*\*/g, '')
    .trim();
  if (cleaned.length < 12 || cleaned.length > 220) return null;
  return cleaned;
};

const TutorMetaChip: React.FC<{
  icon: typeof Search;
  label: string;
  dotClass?: string;
}> = ({ icon: Icon, label, dotClass }) => (
  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
    {dotClass ? <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} /> : <Icon className="h-3 w-3 text-slate-500" />}
    {label}
  </span>
);

const TutorMessageBubble: React.FC<{
  message: TutorMessageView;
  compact?: boolean;
  onReplyQuestion?: (question: string) => void;
  canEdit?: boolean;
  editing?: boolean;
  onStartEdit?: (messageId: string) => void;
  onCancelEdit?: () => void;
  onResend?: (messageId: string, content: string) => void;
  displayedContent?: string;
  isTyping?: boolean;
}> = ({
  message,
  compact = false,
  onReplyQuestion,
  canEdit = false,
  editing = false,
  onStartEdit,
  onCancelEdit,
  onResend,
  displayedContent,
  isTyping = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isUser = message.role === 'user';
  const trailingQuestion = !isUser && !isTyping && onReplyQuestion ? extractTrailingQuestion(message.content) : null;
  const modelMeta = message.apiUsed ? TUTOR_MODEL_META[message.apiUsed] : undefined;
  const stageMeta = message.detectedStage ? TUTOR_STAGE_META[message.detectedStage] : undefined;
  const roleMeta = message.messageRole ? TUTOR_ROLE_META[message.messageRole] : undefined;
  const ModelIcon = modelMeta?.icon ?? SparklesIcon;
  const RoleIcon = roleMeta?.icon ?? Layers;

  useEffect(() => {
    if (!editing) return;
    setDraft(message.content);
    requestAnimationFrame(() => {
      const el = editRef.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [editing, message.content]);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // User can still select the text manually.
    }
  };

  const handleResend = () => {
    const next = draft.trim();
    if (!next || !onResend) return;
    onResend(message.id, next);
  };

  if (isUser) {
    return (
      <div className="group flex justify-end animate-fade-in">
        <div className={`min-w-0 ${compact ? 'max-w-[88%]' : 'max-w-[min(85%,36rem)]'}`}>
          {message.attachedFileName && (
            <div className="mb-1.5 ml-auto flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <FileText className="h-3 w-3 flex-shrink-0 text-slate-500" />
              <span className="max-w-[180px] truncate text-[11px] font-medium text-slate-700">{message.attachedFileName}</span>
            </div>
          )}
          {editing ? (
            <div className="rounded-2xl rounded-br-md border border-slate-300 bg-white p-2.5 shadow-sm ring-2 ring-slate-200/80">
              <textarea
                ref={editRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelEdit?.();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleResend();
                  }
                }}
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
                style={{ minHeight: '40px' }}
                aria-label="Edit message"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">Sends again and replaces later replies</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={!draft.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <Send className="h-3 w-3" />
                    Send again
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl rounded-br-md border border-slate-200 bg-slate-100 px-3.5 py-2.5 shadow-sm">
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-900">
                {message.content}
              </p>
            </div>
          )}
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
            {message.turnNumber != null && <span>Turn {message.turnNumber}</span>}
            {message.turnNumber != null && <span aria-hidden="true">·</span>}
            <span>{formatBubbleTime(message.timestamp)}</span>
            {!editing && (
              <>
                {canEdit && onStartEdit && (
                  <button
                    type="button"
                    onClick={() => onStartEdit(message.id)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                    title="Edit and send again"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 focus:opacity-100"
                  title={copied ? 'Copied' : 'Copy message'}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-start gap-2.5 animate-fade-in">
      <div className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} mt-0.5 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200`}>
        <img src="/images/icon.png" alt="AI Tutor" className="h-full w-full object-cover" />
      </div>
      <div className={`min-w-0 ${compact ? 'max-w-[calc(100%-2.25rem)]' : 'max-w-[min(92%,46rem)]'} flex-1`}>
        <div className="overflow-hidden rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800">AI Tutor</span>
              {isTyping && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Writing
                </span>
              )}
              {modelMeta && (
                <TutorMetaChip icon={ModelIcon} label={modelMeta.label} />
              )}
              {message.detectedStage && (
                <TutorMetaChip
                  icon={stageMeta?.icon ?? Search}
                  label={message.detectedStage}
                  dotClass={stageMeta?.dot}
                />
              )}
              {roleMeta && (
                <TutorMetaChip icon={RoleIcon} label={roleMeta.name} />
              )}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title={copied ? 'Copied' : 'Copy reply'}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className={compact ? 'hidden' : ''}>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="px-3 py-2.5">
            <MarkdownRenderer content={displayedContent ?? message.content} variant="chat" />
            {isTyping && (
              <span className="mt-1 inline-block h-4 w-[1.5px] bg-slate-800 align-middle animate-pulse" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              {message.turnNumber != null && <span>Turn {message.turnNumber}</span>}
              {message.turnNumber != null && <span aria-hidden="true">·</span>}
              <span>{formatBubbleTime(message.timestamp)}</span>
            </div>
            {trailingQuestion && onReplyQuestion && (
              <button
                type="button"
                onClick={() => onReplyQuestion(trailingQuestion)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                title="Put this question in the chat box"
              >
                <Reply className="h-3 w-3" />
                Answer this
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AITestChatbox: React.FC<AITestChatboxProps> = ({
  onGenerateReport,
  embedded = false,
  onMetricsChange,
  onHistoryChange,
  showLeftPanel,
  showRightPanel,
  isTeacher = false,
  courseId = null,
  courseCode = null,
  isActive = true,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [statsPanelCollapsed, setStatsPanelCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [chatHistory, setChatHistory] = useState<AITutorNewSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoadProgress, setHistoryLoadProgress] = useState('');
  const [historyLoadPct, setHistoryLoadPct] = useState(0);
  const [selectedSession, setSelectedSession] = useState<AITutorNewSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<AITutorNewMessage[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>(DEFAULT_SESSION_TITLE);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [displayedTitle, setDisplayedTitle] = useState(DEFAULT_SESSION_TITLE);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isTypingTitle, setIsTypingTitle] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typedReply, setTypedReply] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  type AIModelType = 'gemini-3' | 'gemini-2' | 'claude' | 'gpt-4' | 'grok';
  const [selectedAPI, setSelectedAPI] = useState<AIModelType>(isTeacher ? 'gemini-3' : 'gemini-2');
  const [tutorMode, setTutorMode] = useState<AITutorMode>('learning');
  const [uploadedFile, setUploadedFile] = useState<{ file: File; data: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thinkingAnchorRef = useRef<HTMLDivElement>(null);
  const typingAnchorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Refs to access latest values in cleanup function
  const messagesRef = useRef<Message[]>([]);
  const isSavedRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const currentSessionTitleRef = useRef<string>(DEFAULT_SESSION_TITLE);
  const titleGeneratedRef = useRef<boolean>(false);
  const lastSavedFingerprintRef = useRef<string>('');
  const persistChatNoteRef = useRef<() => Promise<void>>(async () => {});
  const pendingSaveRef = useRef(false);
  const skipTitleCommitRef = useRef(false);
  const titleTypeTimerRef = useRef<number | null>(null);
  const titleGenerationLockRef = useRef(false);
  const replyTypeTimerRef = useRef<number | null>(null);
  const typingFullReplyRef = useRef('');

  const prevCourseIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevCourseIdRef.current !== undefined && prevCourseIdRef.current !== courseId) {
      setMessages([]);
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      lastSavedFingerprintRef.current = '';
      setSelectedSession(null);
      setSessionMessages([]);
      setChatHistory([]);
      setShowHistory(false);
      setCurrentSessionTitle(DEFAULT_SESSION_TITLE);
      setTitleGenerated(false);
      setIsEditingTitle(false);
      setDisplayedTitle(DEFAULT_SESSION_TITLE);
      setIsGeneratingTitle(false);
      setIsTypingTitle(false);
      titleGenerationLockRef.current = false;
      if (titleTypeTimerRef.current) {
        window.clearTimeout(titleTypeTimerRef.current);
        titleTypeTimerRef.current = null;
      }
      if (replyTypeTimerRef.current) {
        window.clearTimeout(replyTypeTimerRef.current);
        replyTypeTimerRef.current = null;
      }
      setTypingMessageId(null);
      setTypedReply('');
      setIsSaved(false);
      setEditingMessageId(null);
    }
    prevCourseIdRef.current = courseId;
  }, [courseId]);

  interface ModelOption {
    value: AIModelType;
    label: string;
    provider: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
  }

  const allModelOptions: ModelOption[] = [
    { value: 'gemini-3', label: 'Gemini 3', provider: 'Google AI', icon: SparklesIcon, iconColor: 'text-purple-600' },
    { value: 'gemini-2', label: 'Gemini', provider: 'Google AI', icon: SparklesIcon, iconColor: 'text-purple-600' },
    { value: 'claude', label: 'Claude', provider: 'Anthropic AI', icon: Brain, iconColor: 'text-orange-600' },
    { value: 'gpt-4', label: 'GPT-4', provider: 'OpenAI', icon: Zap, iconColor: 'text-green-600' },
    { value: 'grok', label: 'Grok', provider: 'xAI', icon: Rocket, iconColor: 'text-blue-600' },
  ];

  // Filter model options based on user role
  const modelOptions: ModelOption[] = isTeacher 
    ? allModelOptions 
    : allModelOptions.filter(opt => opt.value === 'claude' || opt.value === 'gemini-2');

  // Activity tracking
  const { trackChatInteraction } = useActivityTracking();
  
  // New state for enhanced features
  const [currentPhase, setCurrentPhase] = useState('Clarify');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [maxHints] = useState(26);
  const aiUsageSecondsRef = useRef(0);
  const [usageTimerEpoch, setUsageTimerEpoch] = useState(0);
  const [, setEvidenceList] = useState<string[]>([]);
  const [uncertaintyRecord, setUncertaintyRecord] = useState<Array<{
    content: string;
    stage: string;
    confidence: number;
    timestamp: Date;
  }>>([]);
  const [wordCloudKeywords, setWordCloudKeywords] = useState<Array<[string, number]>>([]);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [showExpandedWordCloud, setShowExpandedWordCloud] = useState(false);
  const [showHinaAnalysis, setShowHinaAnalysis] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [wordCloudZoom, setWordCloudZoom] = useState(1);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const lastKeywordExtractionRef = useRef<number>(0);
  const leftSidebarRef = useRef<HTMLDivElement>(null);

  // Phases configuration - 7-Stage Hybrid Cognitive–Metacognitive Learning Journey
  const phases = [
    { 
      id: 'Orient', 
      name: 'Orient', 
      icon: Compass, 
      description: 'Goal setting & prior knowledge activation',
      fullName: 'Orient (Goal Setting & Prior Knowledge Activation)',
      assessment: ['Learning goal clarity', 'Prior knowledge activation ability', 'Learning attitude (willingness to engage)'],
      focus: 'Attitude + Motivation activation'
    },
    { 
      id: 'Clarify', 
      name: 'Clarify & Diagnose', 
      icon: Eye, 
      description: 'Cognitive diagnosis & problem understanding',
      fullName: 'Clarify & Diagnose (Cognitive Diagnosis & Problem Understanding)',
      assessment: ['Problem articulation ability', 'Concept extraction ability', 'Metacognitive diagnosis ability'],
      focus: 'Cognitive diagnosis + Problem understanding'
    },
    { 
      id: 'Strategize', 
      name: 'Strategize & Plan', 
      icon: Network, 
      description: 'Reasoning planning & metacognitive strategy selection',
      fullName: 'Strategize & Plan (Reasoning Planning & Metacognitive Strategy Selection)',
      assessment: ['Cognitive strategies (reasoning, analogy, decomposition, case-based)', 'Metacognitive strategies (monitoring, planning, hypothesis testing)'],
      focus: 'Reasoning planning + Metacognitive strategy selection'
    },
    { 
      id: 'Execute', 
      name: 'Execute & Construct', 
      icon: Hammer, 
      description: 'Construction, reasoning, expression',
      fullName: 'Execute & Construct (Construction, Reasoning, Expression)',
      assessment: ['Logical coherence', 'Knowledge structure processing', 'Creativity (new combinations/new interpretations)'],
      focus: 'Construction, reasoning, expression'
    },
    { 
      id: 'Monitor', 
      name: 'Monitor & Iterate', 
      icon: RefreshCw, 
      description: 'Monitoring, correction, strategy shift',
      fullName: 'Monitor & Iterate (Monitoring, Correction, Strategy Shift)',
      assessment: ['Metacognitive monitoring', 'Self-regulation', 'Emotional regulation (coping with failure, persistence)'],
      focus: 'Monitoring, correction, strategy shift'
    },
    { 
      id: 'Verify', 
      name: 'Verify & Justify', 
      icon: CheckCircle2, 
      description: 'Verification, explanation, evidential reasoning',
      fullName: 'Verify & Justify (Verification, Explanation, Evidential Reasoning)',
      assessment: ['Evidential reasoning ability', 'Evaluative judgment', 'Higher-order explanatory framework ability'],
      focus: 'Verification, explanation, evidential reasoning'
    },
    { 
      id: 'Reflect', 
      name: 'Reflect, Transfer & Identity Growth', 
      icon: ArrowRight, 
      description: 'Transfer, reflection, self-positioning',
      fullName: 'Reflect, Transfer & Identity Growth (Transfer, Reflection, Self-Positioning)',
      assessment: ['Reflection depth', 'Self-evaluation & future planning', 'Learner identity transformation'],
      focus: 'Transfer, reflection, self-positioning'
    },
  ];

  // Role Cards configuration
  const roleCards = [
    { 
      id: 'analyst', 
      name: 'Analyst', 
      description: 'Break down problems systematically and analyze each component',
      icon: Layers,
      color: 'blue'
    },
    { 
      id: 'experimenter', 
      name: 'Experimenter', 
      description: 'Test hypotheses and learn through experimentation',
      icon: FlaskConical,
      color: 'purple'
    },
    { 
      id: 'reviewer', 
      name: 'Reviewer', 
      description: 'Critically evaluate solutions and identify improvements',
      icon: ShieldCheck,
      color: 'green'
    },
    { 
      id: 'summarizer', 
      name: 'Summarizer', 
      description: 'Synthesize learning and articulate understanding',
      icon: FileText,
      color: 'orange'
    },
  ];

  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [introducedRoles, setIntroducedRoles] = useState<Set<string>>(new Set());

  // New tracking states
  const [roleUsageCounts, setRoleUsageCounts] = useState({
    'analyst': 0,
    'experimenter': 0,
    'reviewer': 0,
    'summarizer': 0
  });
  const [activeChartIndex, setActiveChartIndex] = useState(0);
  const [activeJourneyChartIndex, setActiveJourneyChartIndex] = useState(0);
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [activeAnalysisLevel, setActiveAnalysisLevel] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [activeAnalysisSubPage, setActiveAnalysisSubPage] = useState<string>('heatmap');
  const [showCalculationSteps, setShowCalculationSteps] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationComplete, setCalculationComplete] = useState(false);
  const [sessionCalculations, setSessionCalculations] = useState<any[]>([]);
  const [isLoadingCalculations, setIsLoadingCalculations] = useState(false);
  const [calculationSteps, setCalculationSteps] = useState<{
    prompt: string;
    step1_segmentation: Array<{segment: string; index: number}>;
    step2_sentiment: {sentiment: number; confusion_score: number; frustration_score: number; engagement_score: number};
    step3_stageTagging: Array<{
      segment: string;
      stages: Record<string, {p: number; intensity: number}>;
      cognitive_vs_metacognitive: {cognitive: number; metacognitive: number};
    }>;
    step4_aggregation: Record<string, {raw_score: number; normalized_score: number; weight: number}>;
    step5_emotionAdjustment: Record<string, {before: number; after: number; adjustment_factor: number}>;
    step6_smoothing: Record<string, {current: number; previous: number; smoothed: number; lambda: number}>;
    final_scores: Record<string, number>;
    session_level: {
      contribution: Record<string, number>;
      ema_trend: Record<string, number>;
      transition_bonus: Record<string, number>;
      final_session_score: Record<string, number>;
    };
  } | null>(null);
  const [questionTree, setQuestionTree] = useState<Array<{id: string, question: string, timestamp: Date, role?: string, stage?: string}>>([]);
  const [detectedErrors, setDetectedErrors] = useState<Array<{
    type: string; 
    description: string; 
    count: number;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
  }>>([]);
  const [structuredEvidence, setStructuredEvidence] = useState<Array<{
    type: string;
    content: string;
    confidence: number;
    stage: string;
  }>>([]);

  // Learning Process Intelligence Panel state - 7 stages
  const [stagePercentages, setStagePercentages] = useState({
    'Orient': 0,
    'Clarify': 0,
    'Strategize': 0,
    'Execute': 0,
    'Monitor': 0,
    'Verify': 0,
    'Reflect': 0
  });

  // KSA + Meta-Cognition scoring state
  const [ksaScores, setKsaScores] = useState({
    knowledge: {
      conceptUnderstanding: 0,
      reasoningApplication: 0,
      evidenceSupport: 0
    },
    skill: {
      planningAbility: 0,
      reasoningConstruction: 0,
      expressionOrganization: 0,
      verificationExplanation: 0
    },
    attitude: {
      goalClarity: 0,
      persistence: 0,
      growthMindset: 0
    },
    metacognition: {
      monitor: 0,
      regulate: 0,
      evaluate: 0,
      reflection: 0,
      transfer: 0
    }
  });

  // Stage detection service and analyses tracking
  const [stageDetectionService] = useState(() => StageDetectionService.getInstance());
  const [messageAnalyses, setMessageAnalyses] = useState<MessageAnalysisResult[]>([]);
  
  // Track code requests for progressive disclosure
  const [codeRequestTracker, setCodeRequestTracker] = useState<Map<string, number>>(new Map());

  // Keep refs in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    isSavedRef.current = isSaved;
  }, [isSaved]);
  
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);
  
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  useEffect(() => {
    currentSessionTitleRef.current = currentSessionTitle;
  }, [currentSessionTitle]);
  
  useEffect(() => {
    titleGeneratedRef.current = titleGenerated;
  }, [titleGenerated]);

  useEffect(() => {
    return () => {
      if (titleTypeTimerRef.current) {
        window.clearTimeout(titleTypeTimerRef.current);
      }
      if (replyTypeTimerRef.current) {
        window.clearTimeout(replyTypeTimerRef.current);
      }
    };
  }, []);

  // Track AI usage time without re-rendering the chat (keeps text selection intact)
  useEffect(() => {
    if (!isActive || messages.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      aiUsageSecondsRef.current += 1;
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, messages.length]);

  // Handle Escape key to close history modal and API dropdown
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHistory) {
          setShowHistory(false);
          setHistorySearch('');
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showHistory]);

  // Load calculation data from Supabase when detailed analysis modal opens
  useEffect(() => {
    const loadCalculations = async () => {
      if (showDetailedAnalysis && currentSessionId) {
        setIsLoadingCalculations(true);
        try {
          const learningProcessService = LearningProcessService.getInstance();
          const calculations = await learningProcessService.getCalculationsBySession(currentSessionId);
          setSessionCalculations(calculations);
        } catch (error) {
          console.error('Error loading calculations from Supabase:', error);
        } finally {
          setIsLoadingCalculations(false);
        }
      }
    };

    loadCalculations();
  }, [showDetailedAnalysis, currentSessionId]);

  const persistChatNote = useCallback(async () => {
    const noteMessages = toNoteMessages(messagesRef.current);
    if (noteMessages.length === 0) return;

    const title = currentSessionTitleRef.current || DEFAULT_SESSION_TITLE;
    const fingerprint = JSON.stringify({
      title,
      courseId,
      turns: noteMessages.map((message) => `${message.id}:${message.content.length}`),
    });
    if (fingerprint === lastSavedFingerprintRef.current && currentSessionIdRef.current) {
      setIsSaved(true);
      return;
    }
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const session = await AITutorNewService.getInstance().upsertChatNote({
        id: currentSessionIdRef.current,
        title,
        courseId,
        messages: noteMessages,
      });
      if (session) {
        currentSessionIdRef.current = session.id;
        setCurrentSessionId(session.id);
        lastSavedFingerprintRef.current = fingerprint;
        setIsSaved(true);
      } else {
        setIsSaved(false);
      }
    } catch (error) {
      console.error('AITestChatbox: Error autosaving chat note:', error);
      setIsSaved(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void persistChatNote();
      }
    }
  }, [courseId]);

  persistChatNoteRef.current = persistChatNote;

  useEffect(() => {
    if (toNoteMessages(messages).length === 0) return;
    const timer = window.setTimeout(() => {
      void persistChatNote();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [messages, currentSessionTitle, persistChatNote]);

  useEffect(() => {
    const flush = () => {
      void persistChatNoteRef.current();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flush();
    };
  }, []);

  const handleResetConversation = () => {
    setMessages([]);
    setIsSaved(false);
    setEditingMessageId(null);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    lastSavedFingerprintRef.current = '';
    setShowHistory(false);
    setSelectedSession(null);
    setSessionMessages([]);
    setIsLoadingSession(false);
    setCurrentSessionTitle(DEFAULT_SESSION_TITLE);
    setTitleGenerated(false);
    setIsEditingTitle(false);
    setDisplayedTitle(DEFAULT_SESSION_TITLE);
    setIsGeneratingTitle(false);
    setIsTypingTitle(false);
    titleGenerationLockRef.current = false;
    if (titleTypeTimerRef.current) {
      window.clearTimeout(titleTypeTimerRef.current);
      titleTypeTimerRef.current = null;
    }
    if (replyTypeTimerRef.current) {
      window.clearTimeout(replyTypeTimerRef.current);
      replyTypeTimerRef.current = null;
    }
    setTypingMessageId(null);
    setTypedReply('');
    setCurrentPhase('Orient');
    setHintsUsed(0);
    aiUsageSecondsRef.current = 0;
    setUsageTimerEpoch((prev) => prev + 1);
    setEvidenceList([]);
    setUncertaintyRecord([]);
    setActiveRole(null);
    setIntroducedRoles(new Set());
    setIsCalculating(false);
    setCalculationComplete(false);
    setCalculationSteps(null);
    setStagePercentages({
      'Orient': 0,
      'Clarify': 0,
      'Strategize': 0,
      'Execute': 0,
      'Monitor': 0,
      'Verify': 0,
      'Reflect': 0
    });
    setKsaScores({
      knowledge: {
        conceptUnderstanding: 0,
        reasoningApplication: 0,
        evidenceSupport: 0
      },
      skill: {
        planningAbility: 0,
        reasoningConstruction: 0,
        expressionOrganization: 0,
        verificationExplanation: 0
      },
      attitude: {
        goalClarity: 0,
        persistence: 0,
        growthMindset: 0
      },
      metacognition: {
        monitor: 0,
        regulate: 0,
        evaluate: 0,
        reflection: 0,
        transfer: 0
      }
    });
    setMessageAnalyses([]);
    setRoleUsageCounts({
      'analyst': 0,
      'experimenter': 0,
      'reviewer': 0,
      'summarizer': 0
    });
    setQuestionTree([]);
    setDetectedErrors([]);
    setStructuredEvidence([]);
    setCodeRequestTracker(new Map());
    console.log('AITestChatbox: Conversation reset');
  };

  useEffect(() => {
    onMetricsChange?.({
      aiUsageSeconds: aiUsageSecondsRef.current,
      stagePercentages,
      roleUsageCounts,
      messageCounts: {
        user: messages.filter((msg) => msg.role === 'user').length,
        assistant: messages.filter((msg) => msg.role === 'assistant').length,
      },
    });
  }, [stagePercentages, roleUsageCounts, messages, onMetricsChange]);

  useEffect(() => {
    onHistoryChange?.({
      sessions: chatHistory,
      selectedSession,
    });
  }, [chatHistory, selectedSession, onHistoryChange]);

  // Multi-stage scoring calculation function
  // Helper function to render math formulas using KaTeX
  const renderMathFormula = (formula: string, displayMode: boolean = false) => {
    try {
      const html = katex.renderToString(formula, {
        throwOnError: false,
        displayMode: displayMode,
        output: 'html'
      });
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    } catch (error) {
      console.error('Error rendering math formula:', error);
      return <span className="font-mono">{formula}</span>;
    }
  };

  // Helper function to detect if user is asking for code
  const detectCodeRequest = (message: string): boolean => {
    const codeKeywords = [
      'code', 'show me code', 'write code', 'provide code', 'give me code',
      'example code', 'sample code', 'implementation', 'how to code',
      'can you code', 'write a', 'create a', 'make a', 'program', 'function',
      'class', 'script', 'algorithm', 'pseudocode'
    ];
    const lowerMessage = message.toLowerCase();
    return codeKeywords.some(keyword => lowerMessage.includes(keyword));
  };

  // Helper function to extract topic from message for tracking
  const extractTopic = (message: string): string => {
    // Simple topic extraction: use first 50 characters or first sentence
    const firstSentence = message.split(/[.!?。！？\n]/)[0].trim();
    return firstSentence.substring(0, 50).toLowerCase();
  };

  // When user asked for code: display response as-is (backend sends complete code). Do not strip or replace code blocks.
  const applyProgressiveCodeDisclosure = (response: string, codeRequestCount: number): string => {
    if (codeRequestCount >= 1) {
      // Show full response including complete code; optionally add reflection questions if missing
      const hasCodeBlock = /```[\s\S]*?```/.test(response);
      const hasReflectionQuestions = /reflection|reflect|think.*would|why.*think|what.*would.*happen|how.*does|\?$/m.test(response);
      if (hasCodeBlock && !hasReflectionQuestions) {
        return response + `\n\n## Reflection questions\n\n- What would happen if you changed part of this code?\n- Why do you think this approach was used?\n- How would you extend this to a related case?`;
      }
      return response;
    }
    return response;
  };

  const getChatSystemPrompt = () =>
    tutorMode === 'default'
      ? `You are a friendly teacher having a conversation with a student.

CRITICAL - Give the answer directly:
- Answer the question fully and directly — do not withhold the solution
- Explain the core idea in just 2–3 complete sentences (finish your thoughts)
- Do NOT use Socratic questioning or end with a quiz question
- Maximum 100–150 words total for your reply (do not count code)

Start directly with the answer.`
      : `You are a friendly teacher having a conversation with a student.

CRITICAL - Keep it brief but complete:
- Explain the core idea in just 2–3 complete sentences (finish your thoughts)
- Give 1 quick suggestion for next step
- End with 1 complete question

Maximum 100–150 words total for your reply (do not count code). Be concise but ensure all sentences are complete. Fit everything (explanation, guidance, question) within this limit.`;

  const getFileAnalysisInstructions = () =>
    tutorMode === 'default'
      ? `- Read and understand the document content provided above
- Answer the student's question based on the actual content in the document
- Give the complete answer directly — do not withhold information
- Be CONCISE and BRIEF - explain the core idea in 1-2 sentences
- Use the actual terminology and concepts from the document (briefly)
- Do NOT end with a Socratic or quiz question
- Maximum 100-150 words total for your reply (do not count code). Keep your response brief and focused.`
      : `- Read and understand the document content provided above
- Answer the student's question based on the actual content in the document
- Be CONCISE and BRIEF - explain the core idea in 1-2 sentences
- Use the actual terminology and concepts from the document (briefly)
- Maintain your role as an AI tutor - be encouraging, clear, and educational
- Maximum 100-150 words total for your reply (do not count code). Keep your response brief and focused.`;

  const calculateStageScores = async (prompt: string): Promise<typeof calculationSteps> => {
    try {
      // Step 1: Text Segmentation
      const segments = prompt
        .split(/[.!?。！？\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map((s, idx) => ({ segment: s, index: idx + 1 }));

      // Step 2: Sentiment Analysis (using Gemini)
      const sentimentPrompt = `Analyze the sentiment and emotional state of this learning prompt. Return JSON with:
{
  "sentiment": number between -1 (very negative) and 1 (very positive),
  "confusion_score": number between 0 and 1,
  "frustration_score": number between 0 and 1,
  "engagement_score": number between 0 and 1
}

Prompt: "${prompt}"`;

      let sentimentResult = {
        sentiment: 0.2,
        confusion_score: 0.3,
        frustration_score: 0.2,
        engagement_score: 0.8
      };

      try {
        const sentimentResponse = await GeminiService.generateText(sentimentPrompt);
        const jsonMatch = sentimentResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          sentimentResult = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Using default sentiment values');
      }

      // Step 3: Stage Multi-Label Tagger
      const stageTaggerPrompt = `Analyze each segment of this learning prompt and assign stage probabilities. 
Return JSON array where each element has:
{
  "segment": "text",
  "stages": {
    "Orient": {"p": probability 0-1, "intensity": 0-1},
    "Clarify": {"p": probability, "intensity": 0-1},
    "Strategize": {"p": probability, "intensity": 0-1},
    "Execute": {"p": probability, "intensity": 0-1},
    "Monitor": {"p": probability, "intensity": 0-1},
    "Verify": {"p": probability, "intensity": 0-1},
    "Reflect": {"p": probability, "intensity": 0-1}
  },
  "cognitive_vs_metacognitive": {"cognitive": 0-1, "metacognitive": 0-1}
}

Segments: ${JSON.stringify(segments.map(s => s.segment))}`;

      let stageTagging: typeof calculationSteps.step3_stageTagging = segments.map((seg) => ({
        segment: seg.segment,
        stages: {
          'Orient': { p: Math.random() * 0.3, intensity: Math.random() * 0.5 },
          'Clarify': { p: Math.random() * 0.6, intensity: Math.random() * 0.7 },
          'Strategize': { p: Math.random() * 0.5, intensity: Math.random() * 0.6 },
          'Execute': { p: Math.random() * 0.8, intensity: Math.random() * 0.9 },
          'Monitor': { p: Math.random() * 0.4, intensity: Math.random() * 0.5 },
          'Verify': { p: Math.random() * 0.3, intensity: Math.random() * 0.4 },
          'Reflect': { p: Math.random() * 0.2, intensity: Math.random() * 0.3 }
        } as Record<string, {p: number; intensity: number}>,
        cognitive_vs_metacognitive: {
          cognitive: Math.random() * 0.8,
          metacognitive: Math.random() * 0.6
        }
      }));

      try {
        const taggerResponse = await GeminiService.generateText(stageTaggerPrompt);
        const jsonMatch = taggerResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          stageTagging = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Using default stage tagging values');
      }

      // Step 4: Aggregation (sub-segment to prompt level)
      const stageNames = ['Orient', 'Clarify', 'Strategize', 'Execute', 'Monitor', 'Verify', 'Reflect'];
      const aggregation: Record<string, {raw_score: number; normalized_score: number; weight: number}> = {};
      
      stageNames.forEach(stage => {
        let rawScore = 0;
        let totalWeight = 0;
        
        stageTagging.forEach((tag) => {
          const weight = tag.segment.length / prompt.length; // Weight by segment length
          const stageData = tag.stages[stage as keyof typeof tag.stages];
          if (stageData) {
            rawScore += weight * stageData.p * stageData.intensity;
            totalWeight += weight;
          }
        });
        
        aggregation[stage] = {
          raw_score: rawScore,
          normalized_score: 0,
          weight: totalWeight
        };
      });

      // Normalize to 0-5 scale
      const maxRaw = Math.max(...Object.values(aggregation).map(a => a.raw_score), 0.01);
      stageNames.forEach(stage => {
        aggregation[stage].normalized_score = 5 * (aggregation[stage].raw_score / maxRaw);
      });

      // Step 5: Emotion Adjustment
      const emotionAdjustment: Record<string, {before: number; after: number; adjustment_factor: number}> = {};
      // Stable adjustment factors
      const ALPHA = 0.3; // Monitor adjustment (stable)
      const BETA = 0.2; // Reflect adjustment (stable)

      stageNames.forEach(stage => {
        const before = aggregation[stage].normalized_score;
        let after = before;
        let adjustment = 1.0;

        if (stage === 'Monitor') {
          adjustment = 1 + ALPHA * sentimentResult.confusion_score;
          after = before * adjustment;
        } else if (stage === 'Reflect') {
          adjustment = 1 + BETA * sentimentResult.engagement_score;
          after = before * adjustment;
        }

        emotionAdjustment[stage] = {
          before,
          after: Math.min(after, 5), // Cap at 5
          adjustment_factor: adjustment
        };
      });

      // Step 6: Temporal Smoothing (EMA)
      const lambda = 0.3;
      const smoothing: Record<string, {current: number; previous: number; smoothed: number; lambda: number}> = {};
      
      stageNames.forEach(stage => {
        const current = emotionAdjustment[stage].after;
        const previous = stagePercentages[stage as keyof typeof stagePercentages] || 0;
        const smoothed = lambda * current + (1 - lambda) * previous;
        
        smoothing[stage] = {
          current,
          previous,
          smoothed,
          lambda
        };
      });

      // Final scores
      const finalScores: Record<string, number> = {};
      stageNames.forEach(stage => {
        finalScores[stage] = Math.round(smoothing[stage].smoothed * 10) / 10;
      });

      // Session-level calculation
      const sessionLevel = {
        contribution: {} as Record<string, number>,
        ema_trend: {} as Record<string, number>,
        transition_bonus: {} as Record<string, number>,
        final_session_score: {} as Record<string, number>
      };

      stageNames.forEach(stage => {
        sessionLevel.contribution[stage] = finalScores[stage];
        sessionLevel.ema_trend[stage] = smoothing[stage].smoothed;
        // Calculate transition bonus based on stage sequence
        const transitionBonus = Math.random() * 1.5; // Mock transition bonus (in real implementation, analyze sequence)
        sessionLevel.transition_bonus[stage] = transitionBonus;
        sessionLevel.final_session_score[stage] = 
          sessionLevel.contribution[stage] + 
          sessionLevel.ema_trend[stage] * 0.3 + 
          transitionBonus;
      });

      return {
        prompt,
        step1_segmentation: segments,
        step2_sentiment: sentimentResult,
        step3_stageTagging: stageTagging,
        step4_aggregation: aggregation,
        step5_emotionAdjustment: emotionAdjustment,
        step6_smoothing: smoothing,
        final_scores: finalScores,
        session_level: sessionLevel
      };
    } catch (error) {
      console.error('Error calculating stage scores:', error);
      return null;
    }
  };

  // Calculate stage percentages using the new probabilistic multi-layer inference model
  const updateStagePercentages = async (messages: Message[]) => {
    // Filter to only user messages for analysis
    const userMessages: StageUserMessage[] = messages
      .filter(msg => msg.role === 'user')
      .map(msg => ({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        turnNumber: msg.turnNumber
      }));

    if (userMessages.length === 0) {
      setStagePercentages({
        'Orient': 0,
        'Clarify': 0,
        'Strategize': 0,
        'Execute': 0,
        'Monitor': 0,
        'Verify': 0,
        'Reflect': 0
      });
      return;
    }

    try {
      // Process conversation with the new stage detection service
      const result = await stageDetectionService.processConversation(userMessages);
      
      // Update analyses state
      setMessageAnalyses(result.analyses);
      
      // Map old 5-stage model to new 7-stage model
      // Old: Clarify, Plan, Execute, Verify, Reflect
      // New: Orient, Clarify, Strategize, Execute, Monitor, Verify, Reflect
      const oldPercentages = result.stagePercentages;
      
      // Calculate new 7-stage percentages with intelligent mapping
      const newPercentages = {
        'Orient': Math.round((oldPercentages.Clarify || 0) * 0.3), // Part of initial clarification
        'Clarify': Math.round((oldPercentages.Clarify || 0) * 0.7), // Main clarification
        'Strategize': Math.round((oldPercentages.Plan || 0) * 0.8), // Most of planning
        'Execute': Math.round((oldPercentages.Execute || 0) * 0.7), // Main execution
        'Monitor': Math.round((oldPercentages.Execute || 0) * 0.3 + (oldPercentages.Verify || 0) * 0.2), // Monitoring during execution and verification
        'Verify': Math.round((oldPercentages.Verify || 0) * 0.8), // Main verification
        'Reflect': Math.round((oldPercentages.Reflect || 0)) // Full reflection
      };
      
      // Normalize to ensure total is approximately 100%
      const total = Object.values(newPercentages).reduce((sum, val) => sum + val, 0);
      if (total > 0) {
        Object.keys(newPercentages).forEach(key => {
          newPercentages[key as keyof typeof newPercentages] = Math.round(
            (newPercentages[key as keyof typeof newPercentages] / total) * 100
          );
        });
      }
      
      // Update stage percentages
      setStagePercentages(newPercentages);

      // Update current phase to the most dominant stage
      const dominantStage = Object.entries(newPercentages).reduce((a, b) => 
        newPercentages[a[0] as keyof typeof newPercentages] > newPercentages[b[0] as keyof typeof newPercentages] ? a : b
      )[0];
      setCurrentPhase(dominantStage);
    } catch (error) {
      console.error('Error calculating stage percentages:', error);
      // Fallback to zero if calculation fails
      setStagePercentages({
        'Orient': 0,
        'Clarify': 0,
        'Strategize': 0,
        'Execute': 0,
        'Monitor': 0,
        'Verify': 0,
        'Reflect': 0
      });
    }
  };

  const toHinaMessages = useCallback((rows: Array<{
    id: string;
    role: string;
    content: string;
    timestamp?: Date | string;
    created_at?: string;
    detectedStage?: string;
    metadata?: { detectedStage?: string };
  }>): HinaSourceMessage[] =>
    rows
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        timestamp: row.timestamp ?? row.created_at,
        detectedStage: row.detectedStage ?? row.metadata?.detectedStage,
      })), []);

  const loadHinaSessionMessages = useCallback(async (sessionId: string): Promise<HinaSourceMessage[]> => {
    const rows = await AITutorNewService.getInstance().getSessionMessages(sessionId);
    return toHinaMessages(rows);
  }, [toHinaMessages]);

  const handleOpenHinaAnalysis = async () => {
    setShowHinaAnalysis(true);
    if (chatHistory.length === 0) {
      await loadChatHistory();
    }
  };

  const handleJumpToHinaMessage = useCallback((messageId: string) => {
    setShowHinaAnalysis(false);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    window.setTimeout(() => {
      const node = document.getElementById(`tutor-msg-${messageId}`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 2400);
    }, 80);
  }, []);

  useEffect(() => () => {
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
  }, []);

  const loadChatHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryLoadProgress('Loading sessions...');
    setHistoryLoadPct(20);
    try {
      console.log('AITestChatbox: Loading chat history...');
      const aiTutorNewService = AITutorNewService.getInstance();
      setHistoryLoadPct(55);
      const sessions = await aiTutorNewService.getUserSessions(courseId, courseCode);
      setHistoryLoadPct(100);
      setHistoryLoadProgress(
        sessions.length === 0
          ? 'No sessions found'
          : `Loaded ${sessions.length} session${sessions.length === 1 ? '' : 's'}`
      );
      setChatHistory(sessions);
      console.log('AITestChatbox: Loaded', sessions.length, 'chat sessions');
    } catch (error) {
      console.error('AITestChatbox: Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
      setHistoryLoadProgress('');
      setHistoryLoadPct(0);
    }
  };

  const closeHistory = () => {
    setShowHistory(false);
    setHistorySearch('');
    setSelectedSession(null);
    setSessionMessages([]);
    setIsLoadingSession(false);
    setIsLoadingHistory(false);
  };

  const handleShowHistory = async () => {
    if (!showHistory) {
      setShowHistory(true);
      await loadChatHistory();
    } else {
      closeHistory();
    }
  };

  const handleSelectSession = async (session: AITutorNewSession) => {
    try {
      setIsLoadingSession(true);
      console.log('AITestChatbox: Loading messages for session:', session.id);
      const aiTutorNewService = AITutorNewService.getInstance();
      const messages = await aiTutorNewService.getSessionMessages(session.id);
      setSelectedSession(session);
      setSessionMessages(messages);
      console.log('AITestChatbox: Loaded', messages.length, 'messages for session');
    } catch (error) {
      console.error('AITestChatbox: Error loading session messages:', error);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleRestoreSession = async () => {
    if (!selectedSession || !sessionMessages) return;
    
    // Convert database messages to UI messages and sort by turn_number, then by created_at
    const convertedMessages: Message[] = sessionMessages
      .map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        turnNumber: msg.turn_number,
        detectedStage: msg.metadata?.detectedStage,
        messageRole: msg.metadata?.messageRole,
        apiUsed: msg.metadata?.apiUsed,
        attachedFileName: msg.metadata?.attachedFileName
      }))
      .sort((a, b) => {
        // First sort by turn number
        if (a.turnNumber !== b.turnNumber) {
          return (a.turnNumber || 0) - (b.turnNumber || 0);
        }
        // Within the same turn, user messages come before assistant messages
        if (a.role !== b.role) {
          return a.role === 'user' ? -1 : 1;
        }
        // If same role, sort by timestamp
        return a.timestamp.getTime() - b.timestamp.getTime();
      });
    
    // Restore the session to current chat
    setMessages(convertedMessages);
    setCurrentSessionId(selectedSession.id);
    currentSessionIdRef.current = selectedSession.id;
    lastSavedFingerprintRef.current = JSON.stringify({
      title: selectedSession.title,
      courseId,
      turns: toNoteMessages(convertedMessages).map((message) => `${message.id}:${message.content.length}`),
    });
    setCurrentSessionTitle(selectedSession.title);
    setDisplayedTitle(selectedSession.title);
    setIsGeneratingTitle(false);
    setIsTypingTitle(false);
    titleGenerationLockRef.current = true;
    setIsSaved(true);
    setTitleGenerated(true);
    closeHistory();
    void updateStagePercentages(convertedMessages);
  };

  const handleCloseSessionView = () => {
    setSelectedSession(null);
    setSessionMessages([]);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    // Check if it's yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    // Otherwise show full date and time
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getHistoryDateGroup = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (date.getTime() >= startOfWeek.getTime()) return 'This week';
    return 'Earlier';
  };

  const filteredHistory = chatHistory.filter((session) => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return true;
    return (session.title || '').toLowerCase().includes(query);
  });

  const groupedHistory = (['Today', 'Yesterday', 'This week', 'Earlier'] as const)
    .map((label) => ({
      label,
      sessions: filteredHistory.filter((session) => getHistoryDateGroup(session.created_at) === label),
    }))
    .filter((group) => group.sessions.length > 0);

  const generateSessionTitle = async (messages: Message[]) => {
    if (titleGenerated || titleGenerationLockRef.current) return;
    const userCount = messages.filter((message) => message.role === 'user' && isPersistableMessage(message)).length;
    const assistantCount = messages.filter((message) => message.role === 'assistant' && isPersistableMessage(message)).length;
    if (userCount < 1 || assistantCount < 1) return;

    titleGenerationLockRef.current = true;
    setIsGeneratingTitle(true);

    const applyTypedTitle = (nextTitle: string) => {
      const cleanTitle = nextTitle.replace(/^["']|["']$/g, '').trim() || fallbackTitleFromMessages(messages);
      setCurrentSessionTitle(cleanTitle);
      setTitleGenerated(true);
      setIsGeneratingTitle(false);
      if (titleTypeTimerRef.current) {
        window.clearTimeout(titleTypeTimerRef.current);
      }
      setIsTypingTitle(true);
      setDisplayedTitle('');
      let index = 0;
      const typeNext = () => {
        index += 1;
        setDisplayedTitle(cleanTitle.slice(0, index));
        if (index < cleanTitle.length) {
          titleTypeTimerRef.current = window.setTimeout(typeNext, 22 + Math.random() * 28);
        } else {
          setIsTypingTitle(false);
        }
      };
      typeNext();
    };

    try {
      const conversationMessages = messages.map((message) => `${message.role}: ${message.content}`);
      const newTitle = await GeminiService.generateSessionTitle(conversationMessages);
      applyTypedTitle(newTitle);
    } catch (error) {
      console.error('AITestChatbox: Error generating session title:', error);
      applyTypedTitle(fallbackTitleFromMessages(messages));
    }
  };

  const startEditSessionTitle = () => {
    if (isGeneratingTitle) return;
    if (titleTypeTimerRef.current) {
      window.clearTimeout(titleTypeTimerRef.current);
      titleTypeTimerRef.current = null;
    }
    setIsTypingTitle(false);
    setDisplayedTitle(currentSessionTitle);
    skipTitleCommitRef.current = false;
    setTitleDraft(currentSessionTitle);
    setIsEditingTitle(true);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  };

  const commitSessionTitle = () => {
    if (skipTitleCommitRef.current) {
      skipTitleCommitRef.current = false;
      setIsEditingTitle(false);
      return;
    }
    const next = titleDraft.trim();
    if (next) {
      if (titleTypeTimerRef.current) {
        window.clearTimeout(titleTypeTimerRef.current);
      }
      setIsTypingTitle(false);
      setIsGeneratingTitle(false);
      setCurrentSessionTitle(next);
      setDisplayedTitle(next);
      setTitleGenerated(true);
      titleGenerationLockRef.current = true;
    }
    setIsEditingTitle(false);
  };

  const cancelSessionTitleEdit = () => {
    skipTitleCommitRef.current = true;
    setIsEditingTitle(false);
    setTitleDraft(currentSessionTitle);
  };

  const handleSaveConversation = async () => {
    if (toNoteMessages(messages).length === 0 || isSaving) return;
    if (!titleGenerated && messages.length >= 2) {
      await generateSessionTitle(messages);
    }
    lastSavedFingerprintRef.current = '';
    await persistChatNote();
  };

  // No word limit - allow detailed, comprehensive responses

  // Auto-resize textarea function
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 200; // Maximum height in pixels (about 8-9 lines)
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  };

  // Adjust textarea height when input value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue]);

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (replyTypeTimerRef.current) {
      window.clearTimeout(replyTypeTimerRef.current);
      replyTypeTimerRef.current = null;
    }
    setTypingMessageId(null);
    setTypedReply('');
    setIsLoading(false);
  };

  const startReplyTyping = (messageId: string, content: string) => {
    if (replyTypeTimerRef.current) {
      window.clearTimeout(replyTypeTimerRef.current);
      replyTypeTimerRef.current = null;
    }
    const full = content ?? '';
    if (full.length < 12) {
      typingFullReplyRef.current = '';
      setTypingMessageId(null);
      setTypedReply('');
      return;
    }
    typingFullReplyRef.current = full;
    setTypingMessageId(messageId);
    setTypedReply('');
  };

  useEffect(() => {
    if (!typingMessageId) return;
    const full = typingFullReplyRef.current;
    if (!full || typedReply.length >= full.length) {
      setTypingMessageId(null);
      setTypedReply('');
      typingFullReplyRef.current = '';
      return;
    }
    const next = nextTypedReplyLength(full, typedReply.length);
    replyTypeTimerRef.current = window.setTimeout(() => {
      setTypedReply(full.slice(0, next));
    }, typedReply.length === 0 ? 40 : 10 + Math.random() * 18);
    return () => {
      if (replyTypeTimerRef.current) {
        window.clearTimeout(replyTypeTimerRef.current);
        replyTypeTimerRef.current = null;
      }
    };
  }, [typingMessageId, typedReply]);

  useEffect(() => {
    if (!typingMessageId) return;
    typingAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [typedReply, typingMessageId]);

  useEffect(() => {
    if (!isLoading) return;
    thinkingAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isLoading, messages.length]);

  const handleSendMessage = async (options?: { text?: string; replaceFromId?: string }) => {
    const trimmedInput = (options?.text ?? inputValue).trim();
    if (!trimmedInput || isLoading || typingMessageId) return;

    const replaceFromId = options?.replaceFromId;
    const replaceIndex = replaceFromId
      ? messages.findIndex((message) => message.id === replaceFromId)
      : -1;
    const baseMessages = replaceIndex >= 0 ? messages.slice(0, replaceIndex) : messages;
    setEditingMessageId(null);

    // Check if the message is a greeting - if so, return hardcoded response without calling AI
    const isGreeting = (() => {
      if (!trimmedInput || typeof trimmedInput !== 'string') {
        return false;
      }
      
      const lowerMessage = trimmedInput.toLowerCase();
      const greetingWords = [
        'hello',
        'hi',
        'hey',
        'greetings',
        'good to see you',
        'nice to meet you',
        'pleased to meet you',
        'glad to meet you',
        'happy to meet you',
        'lovely to meet you',
        'good morning',
        'good afternoon',
        'good evening',
        'it\'s a pleasure to meet you',
        'it is a pleasure to meet you',
        'how do you do',
        'great to see you',
        'good to have you here',
        'nice seeing you',
        'happy to see you',
        'welcome'
      ];
      
      // Remove all punctuation and normalize whitespace for comparison
      const normalizedMessage = lowerMessage
        .replace(/[.,!?;:'"()\[\]{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Check if the normalized message exactly matches a greeting
      const isMatch = greetingWords.some(greeting => {
        const greetingLower = greeting.toLowerCase();
        return normalizedMessage === greetingLower;
      });
      
      if (isMatch) {
        console.log('AITestChatbox: ✅ Greeting detected:', trimmedInput);
      }
      
      return isMatch;
    })();
    
    // If it's a greeting, return hardcoded response immediately without any AI calls
    if (isGreeting) {
      console.log('AITestChatbox: Returning hardcoded greeting response (NOT calling AI)');
      
      // Calculate turn number
      const userMessageCount = baseMessages.filter(msg => msg.role === 'user').length;
      const turnNumber = userMessageCount + 1;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmedInput,
        timestamp: new Date(),
        turnNumber: turnNumber,
        attachedFileName: uploadedFile ? uploadedFile.file.name : undefined
      };

      setMessages([...baseMessages, userMessage]);
      setInputValue('');
      
      // Reset textarea height after sending
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }, 0);
      
      // Return hardcoded response
      const hardcodedResponse = "Hello! I'm ready to help you learn about something new today. What topic are you curious about, or what are you working on right now?";
      
      const aiResponse: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: hardcodedResponse,
        timestamp: new Date(),
        turnNumber: turnNumber,
        apiUsed: selectedAPI
      };
      
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
      setUploadedFile(null);
      startReplyTyping(aiResponse.id, hardcodedResponse);
      void generateSessionTitle([...baseMessages, userMessage, aiResponse]);
      return;
    }
    
    // Calculate turn number: count user messages to determine next turn number
    const userMessageCount = baseMessages.filter(msg => msg.role === 'user').length;
    const turnNumber = userMessageCount + 1;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
      turnNumber: turnNumber,
      attachedFileName: uploadedFile ? uploadedFile.file.name : undefined
    };

    setMessages([...baseMessages, userMessage]);
    setInputValue('');
    // Reset textarea height after sending
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);
    setIsLoading(true);
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    console.log('AITestChatbox: Starting direct Gemini API test...');
    console.log('AITestChatbox: User message:', userMessage.content);

    try {
      // Skip heavy background stage analysis/calculation to keep response time short
      const detectedStage = 'Clarify';
      
      console.log('AITestChatbox: Calling AI service...');
      console.log('AITestChatbox: Selected API:', selectedAPI);
      console.log('AITestChatbox: Active role:', activeRole);
      
      // Use AI Tutor services with proper prompt system (not direct API calls)
      // NOTE: We do NOT create or save to a session here - messages are only saved when user clicks Save button or exits the page
      // We only use currentSessionId if it already exists (from a previous save) for conversation history context
      
      // Use AITutorNewService which properly handles conversation history
      // NOTE: We do NOT save messages here - they are only saved when user clicks Save button or exits the page
      let response: string;
      
      // If file is attached, use ZenMux with Gemini 2.5 Flash for file processing (same as PDF Summary)
      if (uploadedFile) {
        try {
          // Build prompt with file content (same structure as PDF Summary)
          let promptWithFile = '';
          let fileResponse: string | null = null;
          
          if (uploadedFile.mimeType === 'text/extracted-pdf') {
            // For PDFs, we have extracted text
            const maxTextLength = 50000; // Same limit as PDF Summary
            let textForAI = uploadedFile.data;
            
            if (textForAI.length > maxTextLength) {
              textForAI = textForAI.substring(0, maxTextLength);
              textForAI += '\n\n[Note: Content truncated due to length limits.]';
            }
            
            promptWithFile = `You are an expert AI tutor. A student has uploaded a PDF document and asked you a question. Please read the document content carefully and provide a helpful, detailed response to their question.

STUDENT'S QUESTION:
${userMessage.content}

EXTRACTED PDF CONTENT:
${textForAI}

INSTRUCTIONS:
${getFileAnalysisInstructions()}${tutorMode === 'learning' ? `
- If the question cannot be answered from the document, briefly explain what information is available and suggest what additional information might be needed` : ''}`;
          } else if (uploadedFile.mimeType.startsWith('image/')) {
            // For images, inform user that image analysis requires description
            fileResponse = 'I can see you\'ve uploaded an image. For detailed image analysis, please describe what you see in the image or ask specific questions about it. I can help you understand concepts related to the image content.';
            setUploadedFile(null);
            // Skip ZenMux call for images
            promptWithFile = '';
          } else if (uploadedFile.mimeType === 'text/plain') {
            // For text files, decode base64 and use the text
            try {
              const textContent = atob(uploadedFile.data);
              promptWithFile = `You are an expert AI tutor. A student has uploaded a text document and asked you a question. Please read the document content carefully and provide a helpful, detailed response.

STUDENT'S QUESTION:
${userMessage.content}

UPLOADED TEXT DOCUMENT:
${textContent}

INSTRUCTIONS:
${getFileAnalysisInstructions()}`;
            } catch (decodeError) {
              console.error('Error decoding text file:', decodeError);
              throw new Error('Failed to read text file content');
            }
          } else {
            // For other file types, inform user
            fileResponse = 'I can see you\'ve uploaded a file. For best results with file analysis, please upload PDF or text files. I can help you with questions about the content.';
            setUploadedFile(null);
            // Skip ZenMux call for unsupported file types
            promptWithFile = '';
          }
          
          // Use ZenMux with Gemini 2.5 Flash (same as PDF Summary)
          if (promptWithFile && !fileResponse) {
            fileResponse = await ZenMuxService.generateContent(
              ZenMuxService.MODELS.GEMINI_2_5_FLASH,
              promptWithFile,
              getChatSystemPrompt(),
              {
                temperature: 0.7,
                abortSignal: abortController.signal,
              }
            );
          }
          
          // Set response from file processing
          response = fileResponse || 'I encountered an error processing the file. Please try again.';
          
          // Clear uploaded file after processing
          setUploadedFile(null);
        } catch (error) {
          console.error('Error processing file with ZenMux:', error);
          // Fallback to regular message processing
          // Build conversation history from local messages (don't use sendMessage which auto-saves)
          const conversationHistory = baseMessages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }));
          
          const systemPrompt = getChatSystemPrompt();
          const conversationContext = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n') + `\nuser: ${userMessage.content}\nassistant:`;
          
          if (selectedAPI === 'gemini-3' || selectedAPI === 'gemini-2' || selectedAPI === 'gpt-4' || selectedAPI === 'grok') {
            const modelMap: Record<string, string> = {
              'gemini-3': ZenMuxService.MODELS.GEMINI_3_FLASH,
              'gemini-2': ZenMuxService.MODELS.GEMINI_2_5_FLASH,
              'gpt-4': ZenMuxService.MODELS.GPT_4,
              'grok': ZenMuxService.MODELS.GEMINI_2_5_FLASH, // ZenMux: grok fallback to Gemini
            };
            response = await ZenMuxService.generateContent(
              modelMap[selectedAPI],
              conversationContext,
              systemPrompt,
              { abortSignal: abortController.signal }
            );
          } else if (selectedAPI === 'claude') {
            response = await ClaudeService.generateContent(conversationContext, null);
          } else {
            response = 'I encountered an error processing the file. Please try again.';
          }
        }
      } else {
        // Use generateAIResponse instead of sendMessage to prevent auto-saving
        // Build conversation history from local messages for context
        const conversationHistory = baseMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));
        
        // Check for code request: use global count for progressive disclosure (1st=pseudo, 2nd=partial, 3rd+=full)
        const isCodeRequest = detectCodeRequest(userMessage.content);
        let codeRequestCount = 0;
        if (isCodeRequest) {
          setCodeRequestTracker(prev => {
            const next = (prev.get('__global') ?? 0) + 1;
            const newTracker = new Map(prev);
            newTracker.set('__global', next);
            return newTracker;
          });
          codeRequestCount = (codeRequestTracker.get('__global') ?? 0) + 1;
        }
        
        // Use generateAIResponse which only generates response without saving to database
        // We need to pass session ID for context, but it won't save if session doesn't exist
        // If we have a session, use it for history context; otherwise build from local messages
        const aiTutorService = AITutorNewService.getInstance();
        response = await aiTutorService.generateAIResponse(
          currentSessionId || '',
          userMessage.content,
          codeRequestCount,
          tutorMode,
          courseId,
          courseCode,
          abortController.signal
        );
        
        // Apply post-processing for code responses (do not strip code)
        if (tutorMode === 'learning' && isCodeRequest && codeRequestCount > 0) {
          response = applyProgressiveCodeDisclosure(response, codeRequestCount);
        }
      }
      
      // Fallback handler for edge cases
      if (!response) {
        // Fallback: Build conversation history from local messages state
        const conversationHistory = baseMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));
        
        // Fallback: Use appropriate service based on selected model
        const systemPrompt = getChatSystemPrompt();
        const conversationContext = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n') + `\nuser: ${userMessage.content}\nassistant:`;
        
        if (selectedAPI === 'gemini-3' || selectedAPI === 'gemini-2' || selectedAPI === 'gpt-4' || selectedAPI === 'grok') {
          // Use ZenMux for AI tutor chat
          const modelMap: Record<string, string> = {
            'gemini-3': ZenMuxService.MODELS.GEMINI_3_FLASH,
            'gemini-2': ZenMuxService.MODELS.GEMINI_2_5_FLASH,
            'gpt-4': ZenMuxService.MODELS.GPT_4,
            'grok': ZenMuxService.MODELS.GEMINI_2_5_FLASH, // ZenMux: grok fallback to Gemini
          };
          response = await ZenMuxService.generateContent(
            modelMap[selectedAPI],
            conversationContext,
            systemPrompt,
            { abortSignal: abortController.signal }
          );
        } else if (selectedAPI === 'claude') {
          response = await ClaudeService.generateContent(conversationContext, null);
        } else {
          // Fallback to AITutoringService for compatibility
          const { AITutoringService } = await import('../../services/aiTutoringService');
          const intent = AITutoringService.analyzeStudentIntent(userMessage.content);
          const aiResponse = await AITutoringService.generateAIResponse(
            userMessage.content,
            intent,
            'intermediate',
            undefined,
            0,
            'gemini', // Fallback to gemini for compatibility
            conversationHistory
          );
          response = aiResponse.content;
        }
      }
      
      if (abortController.signal.aborted) {
        return;
      }

      // Use full response as-is (no truncation)
      console.log('AITestChatbox: Setting AI message, content length:', response?.length ?? 0);
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response ?? '',
        timestamp: new Date(),
        turnNumber: turnNumber, // Use the same turn number as the user message
        detectedStage: detectedStage, // Use the dominant stage from probabilistic analysis
        messageRole: activeRole || undefined, // Store the role used for this message
        apiUsed: uploadedFile ? 'gemini-2' : selectedAPI // Store which API was used (gemini-2 for file processing)
      };
      
      // Messages are NOT automatically saved - they are stored locally only
      // Messages will be saved when user clicks Save button or exits the page
      const updatedMessages = [...baseMessages, userMessage, aiMessage];
      setMessages(updatedMessages);
      setIsLoading(false);
      setIsSaved(false);
      startReplyTyping(aiMessage.id, response ?? '');
      
      if (!titleGenerated) {
        void generateSessionTitle(updatedMessages);
      }
      
      // Update stage percentages using the new probabilistic model
      await updateStagePercentages(updatedMessages);
      
      // Update evidence list with potential insights from the conversation
      if (response.toLowerCase().includes('understand') || response.toLowerCase().includes('learned')) {
        setEvidenceList(prev => [...prev, `New understanding from turn ${messages.length / 2 + 1}`]);
      }
      
      // Track role usage
      if (activeRole) {
        setRoleUsageCounts(prev => ({
          ...prev,
          [activeRole]: prev[activeRole as keyof typeof prev] + 1
        }));
      }
      
      // Track questions in the message
      const questionPattern = /\?/;
      if (questionPattern.test(userMessage.content)) {
        setQuestionTree(prev => [...prev, {
          id: `q-${Date.now()}`,
          question: userMessage.content,
          timestamp: userMessage.timestamp,
          role: activeRole || undefined,
          stage: detectedStage
        }]);
      }
      
      // Add structured evidence
      if (response.length > 50) {
        const confidence = Math.min(0.6 + Math.random() * 0.4, 0.95);
        setStructuredEvidence(prev => [...prev, {
          type: 'Reasoning',
          content: response.substring(0, 100) + '...',
          confidence: Math.round(confidence * 100) / 100,
          stage: detectedStage
        }]);
      }
      
      // Detect uncertainties in user messages
      detectUncertainties(userMessage.content, detectedStage);
      
      // Detect errors in user messages
      detectErrors(userMessage.content);
      
      // Track chat interaction
      await trackChatInteraction(currentSessionId || undefined, 'ai_tutor', {
        api_used: selectedAPI,
        active_role: activeRole,
        detected_stage: detectedStage,
        message_count: updatedMessages.length,
        hints_used: hintsUsed,
      });
      
      const modelLabel = modelOptions.find(opt => opt.value === selectedAPI)?.label || selectedAPI;
      console.log(`AITestChatbox: ${modelLabel} API response received!`);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      const modelLabel = modelOptions.find(opt => opt.value === selectedAPI)?.label || selectedAPI;
      console.error(`AITestChatbox: Error calling ${modelLabel} API:`, error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an issue generating a response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      console.log('AITestChatbox: Test completed');
    }
  };

  const detectUncertainties = (message: string, stage: string) => {
    const uncertaintyKeywords = [
      'not sure', 'uncertain', 'confused', 'unclear', 'confusion', 
      'not certain', 'don\'t know', 'dunno', 'unsure', 'doubt',
      'maybe', 'perhaps', 'might', 'think', 'guess',
      'does this', 'is this', 'should i', 'would this', 'could this'
    ];
    
    const lowerMessage = message.toLowerCase();
    const hasUncertainty = uncertaintyKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasUncertainty) {
      const confidence = Math.max(0.3, 1 - (uncertaintyKeywords.filter(k => lowerMessage.includes(k)).length * 0.15));
      
      setUncertaintyRecord(prev => [...prev, {
        content: message.length > 80 ? message.substring(0, 80) + '...' : message,
        stage: stage,
        confidence: Math.round(confidence * 100) / 100,
        timestamp: new Date()
      }]);
    }
  };

  const detectErrors = (message: string) => {
    const errorPatterns = [
      {
        keywords: ['error', 'exception', 'traceback', 'bug', 'broken', 'fail', 'crash'],
        type: 'Runtime Error',
        severity: 'high' as const
      },
      {
        keywords: ['indexerror', 'keyerror', 'attributeerror', 'typeerror', 'valueerror'],
        type: 'Python Exception',
        severity: 'high' as const
      },
      {
        keywords: ['syntax error', 'indentation', 'invalid syntax', 'unexpected'],
        type: 'Syntax Error',
        severity: 'high' as const
      },
      {
        keywords: ['wrong', 'incorrect', 'doesn\'t work', 'not working', 'broken'],
        type: 'Logic Error',
        severity: 'medium' as const
      },
      {
        keywords: ['off by one', 'bounds', 'index out of', 'out of range'],
        type: 'Bounds Error',
        severity: 'high' as const
      },
      {
        keywords: ['empty', 'null', 'none', 'undefined'],
        type: 'Edge Case',
        severity: 'medium' as const
      },
      {
        keywords: ['infinite loop', 'never ends', 'hangs', 'timeout'],
        type: 'Control Flow Error',
        severity: 'high' as const
      },
      {
        keywords: ['slow', 'inefficient', 'time limit', 'timeout'],
        type: 'Performance Issue',
        severity: 'low' as const
      }
    ];
    
    const lowerMessage = message.toLowerCase();
    
    errorPatterns.forEach(pattern => {
      const matches = pattern.keywords.filter(keyword => lowerMessage.includes(keyword)).length;
      
      if (matches > 0) {
        setDetectedErrors(prev => {
          const existing = prev.find(e => e.type === pattern.type);
          
          if (existing) {
            // Increment count if error type already exists
            return prev.map(e => 
              e.type === pattern.type 
                ? { ...e, count: e.count + 1, timestamp: new Date() }
                : e
            );
          } else {
            // Add new error type
            return [...prev, {
              type: pattern.type,
              description: `${pattern.type.toLowerCase()} detected in user message`,
              count: 1,
              severity: pattern.severity,
              timestamp: new Date()
            }];
          }
        });
      }
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 20MB for Gemini)
    if (file.size > 20 * 1024 * 1024) {
      alert('File size must be less than 20MB');
      return;
    }

    // Check file type - PDF and text files only (images not allowed)
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    // Block PNG and JPG files
    if (file.type === 'image/png' || file.type === 'image/jpeg' || 
        file.name.match(/\.(jpg|jpeg|png)$/i)) {
      alert('PNG and JPG files are not allowed. Please upload PDF or text files.');
      return;
    }
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|doc|docx)$/i)) {
      alert('File type not supported. Please upload PDF or text files.');
      return;
    }

    try {
      // For PDF files, extract text using the same method as PDF Summary
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Extract text from PDF using pdfjs-dist (same as PDF Summary)
        const pdfjsLib = await import('pdfjs-dist');
        const { applyPdfWorker } = await import('../../lib/pdfjsWorker');
        applyPdfWorker(pdfjsLib);
        
        const arrayBuffer = await file.arrayBuffer();
        
        // Validate PDF header
        const uint8Array = new Uint8Array(arrayBuffer);
        const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4));
        if (pdfHeader !== '%PDF') {
          alert('File is not a valid PDF');
          return;
        }
        
        // Parse PDF document
        const pdf = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          verbosity: 0
        }).promise;
        
        console.log(`PDF loaded: ${pdf.numPages} pages`);
        
        // Extract text from all pages (same method as PDF Summary)
        let extractedText = '';
        const totalPages = pdf.numPages;
        
        const batchSize = 3;
        for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
          const endPage = Math.min(startPage + batchSize - 1, totalPages);
          
          for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            try {
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();
              
              // Improved text extraction - preserve structure
              let pageText = '';
              const textItems: Array<{text: string, y: number, x: number, fontSize: number}> = [];
              
              // Collect all text items with their positions
              textContent.items.forEach((item: any) => {
                if (item.str && item.str.trim()) {
                  textItems.push({
                    text: item.str,
                    y: item.transform[5] || 0,
                    x: item.transform[4] || 0,
                    fontSize: item.transform[0] || 12
                  });
                }
              });
              
              // Sort by Y position (top to bottom), then by X (left to right)
              textItems.sort((a, b) => {
                const yDiff = Math.abs(b.y - a.y);
                if (yDiff > 3) {
                  return b.y - a.y; // Different lines
                }
                return a.x - b.x; // Same line, left to right
              });
              
              // Build text with proper line breaks
              let currentLine = '';
              let lastY: number | null = null;
              
              textItems.forEach((item) => {
                const yDiff = lastY !== null ? Math.abs(item.y - lastY) : 0;
                
                // New line if Y position changed significantly
                if (lastY !== null && yDiff > 5) {
                  if (currentLine.trim()) {
                    pageText += currentLine.trim() + '\n';
                  }
                  currentLine = '';
                }
                
                // Add text to current line
                if (currentLine && !currentLine.endsWith(' ')) {
                  currentLine += ' ';
                }
                currentLine += item.text;
                
                lastY = item.y;
              });
              
              // Add last line
              if (currentLine.trim()) {
                pageText += currentLine.trim();
              }
              
              // Clean up but preserve structure
              pageText = pageText
                .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
                .trim();
              
              if (pageText && pageText.length > 10) {
                extractedText += `\n\n=== PAGE ${pageNum} ===\n\n${pageText}`;
              }
            } catch (pageError) {
              console.warn(`Error extracting text from page ${pageNum}:`, pageError);
              // Try alternative extraction method
              try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const simpleText = textContent.items
                  .map((item: any) => item.str || '')
                  .filter((text: string) => text.trim())
                  .join(' ');
                if (simpleText.trim()) {
                  extractedText += `\n\n=== PAGE ${pageNum} ===\n\n${simpleText.trim()}`;
                }
              } catch (retryError) {
                console.error(`Failed to extract text from page ${pageNum} after retry:`, retryError);
              }
            }
          }
        }
        
        // Store extracted text instead of base64 for PDFs
        setUploadedFile({
          file,
          data: extractedText.trim(),
          mimeType: 'text/extracted-pdf'
        });
      } else {
        // For non-PDF files (images, text), convert to base64
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          // Remove data URL prefix if present
          const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
          setUploadedFile({
            file,
            data: base64,
            mimeType: file.type || 'application/octet-stream'
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please try again.');
    }
    
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getHintQuotaPercent = () => {
    return Math.min((hintsUsed / maxHints) * 100, 100);
  };

  const getRoleIntroduction = (roleId: string): string => {
    const introductions: Record<string, string> = {
      'analyst': `🧩 **Welcome to Analyst Mode!**

I'm now thinking as an **Analyst**, and I'll help you develop systematic problem-solving skills.

**What I'll do:**
🔍 Decompose complex problems into manageable components
📊 Identify patterns, relationships, and dependencies  
🧠 Use structured logical reasoning
❓ Ask strategic questions that reveal hidden structures

**When to use:** When you need to break down a complex problem, understand requirements clearly, or design systematic solutions.

*Ready to analyze together? Share your problem or question!* 💡`,
      
      'experimenter': `🧪 **Welcome to Experimenter Mode!**

I'm now thinking as an **Experimenter**, and I'll help you learn through active exploration and hypothesis-testing.

**What I'll do:**
🔬 Guide you in forming testable hypotheses
🧪 Encourage trying multiple approaches without fear
🚀 Help you iterate and refine through trial and error
💡 Explore "what-if" scenarios and alternative solutions

**When to use:** When you want to try different approaches, test ideas, or discover solutions through experimentation.

*Ready to experiment? Let's explore possibilities together!* 🚀`,
      
      'reviewer': `🔍 **Welcome to Reviewer Mode!**

I'm now thinking as a **Reviewer**, and I'll help you critically evaluate and improve your work.

**What I'll do:**
✅ Examine solutions from multiple perspectives
🎯 Identify potential issues and edge cases
💎 Suggest improvements and optimizations
🔍 Help you see what might be missing or could be better

**When to use:** When you want to refine your solution, catch errors, or improve quality.

*Ready to review? Share your work and let's make it excellent!* ✓`,
      
      'summarizer': `📝 **Welcome to Summarizer Mode!**

I'm now thinking as a **Summarizer**, and I'll help you synthesize your learning and articulate understanding.

**What I'll do:**
🧠 Help you connect concepts and see the big picture
📚 Consolidate insights and key takeaways  
💬 Guide you to explain things in your own words
🌟 Reflect on what you've learned and how it fits together

**When to use:** When you want to solidify understanding, create summaries, or reflect on your learning journey.

*Ready to synthesize? Let's articulate what you've learned!* 🧠`
    };
    return introductions[roleId] || '';
  };

  const handleRoleClick = (roleId: string) => {
    const isCurrentlyActive = activeRole === roleId;
    setActiveRole(isCurrentlyActive ? null : roleId);
    
    // Check if this is the first time clicking this specific role
    if (!isCurrentlyActive && !introducedRoles.has(roleId)) {
      // Mark this role as introduced
      setIntroducedRoles(prev => new Set([...prev, roleId]));
      
      // Add introduction message
      const selectedRole = roleCards.find(r => r.id === roleId);
      if (selectedRole) {
        const introMessage: Message = {
          id: `intro-${Date.now()}`,
          role: 'assistant',
          content: getRoleIntroduction(roleId),
          timestamp: new Date(),
          messageRole: roleId
        };
        setMessages(prev => [...prev, introMessage]);
      }
    }
  };

  // Hide panels for students
  const leftPanelVisible = isTeacher && (showLeftPanel ?? !embedded);
  const rightPanelVisible = isTeacher && (showRightPanel ?? !embedded);
  const promptCount = messages.filter((msg) => msg.role === 'user').length;
  const currentTurn = messages.length > 0
    ? Math.max(...messages.map((msg) => msg.turnNumber || 1), 1)
    : 0;
  
  // Extract keywords related to Social Data Science from chat messages (both user and AI)
  const extractKeywords = async () => {
    const allMessages = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (allMessages.length === 0) {
      setWordCloudKeywords([]);
      return;
    }

    // Only regenerate if we have new messages (avoid unnecessary API calls)
    const messageCount = allMessages.length;
    if (messageCount < 3) {
      return;
    }

    // Don't regenerate if we just extracted (avoid duplicate calls)
    if (messageCount === lastKeywordExtractionRef.current) {
      return;
    }

    lastKeywordExtractionRef.current = messageCount;
    setIsGeneratingKeywords(true);
    try {
      // Combine both user messages and AI responses
      const allText = allMessages.map(msg => msg.content).join('\n');
      
      const prompt = `You are analyzing a conversation between a student and an AI tutor. Extract keywords related to Social Data Science from both the user's messages and the AI's responses.

Focus on keywords that relate to:
- Social Data Science concepts, methods, and techniques
- Data analysis, statistics, and computational methods
- Social research methodologies
- Key terms, concepts, and topics discussed in the conversation
- Technical terms and domain-specific vocabulary

CONVERSATION:
${allText}

Extract keywords (1-3 words each) that are most relevant to Social Data Science. Return them as a JSON array of arrays, where each inner array has two elements: [keyword, frequency_weight].
The frequency_weight should be between 1-100 based on how frequently or importantly the keyword appears.

Return ONLY the JSON array in this format:
[["keyword1", weight1], ["keyword2", weight2], ["keyword3", weight3], ...]

Example:
[["data analysis", 85], ["social network", 72], ["regression", 68], ["survey methods", 65]]`;

      const response = await GeminiService.generateContent(prompt);
      
      // Fallback when AI returns plain text or we can't parse JSON (no throw, use this)
      const getFallbackKeywords = (text: string): Array<[string, number]> => {
        const socialDataScienceTerms = [
          'data', 'analysis', 'social', 'network', 'regression', 'statistics',
          'survey', 'research', 'dataset', 'variable', 'correlation', 'causation',
          'quantitative', 'qualitative', 'hypothesis', 'model', 'algorithm',
          'machine learning', 'visualization', 'demographics', 'population',
          'sample', 'bias', 'validity', 'reliability', 'methodology'
        ];
        const lower = text.toLowerCase();
        const keywordMap = new Map<string, number>();
        socialDataScienceTerms.forEach(term => {
          const matches = lower.match(new RegExp(term, 'gi'));
          if (matches) keywordMap.set(term, matches.length);
        });
        const words = lower.replace(/[^\w\s]/g, ' ').split(/\s+/)
          .filter(w => w.length > 4)
          .reduce((acc: Record<string, number>, word) => {
            if (!socialDataScienceTerms.includes(word)) acc[word] = (acc[word] || 0) + 1;
            return acc;
          }, {});
        const allKeywords = Array.from(keywordMap.entries())
          .concat(Object.entries(words).slice(0, 15))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30);
        const maxFreq = Math.max(...allKeywords.map(([, f]) => f), 1);
        return allKeywords.map(([word, freq]) => [
          word,
          Math.max(10, Math.min(100, (freq / maxFreq) * 100))
        ]) as Array<[string, number]>;
      };

      // Try to parse JSON from response (AI may return plain text or malformed JSON)
      let parsedKeywords: Array<[string, number]> = [];
      try {
        const codeBlockMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        const jsonStr = codeBlockMatch ? codeBlockMatch[1] : response.match(/\[[\s\S]*\]/)?.[0];
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.every(
            (k: unknown) => Array.isArray(k) && k.length >= 2 && typeof k[0] === 'string'
          )) {
            parsedKeywords = parsed as Array<[string, number]>;
          }
        }
      } catch (e) {
        console.warn('Failed to parse keywords JSON, using fallback extraction', e);
      }
      if (parsedKeywords.length === 0) {
        parsedKeywords = getFallbackKeywords(allText);
      }

      // Validate and normalize keywords for word cloud
      const validKeywords = parsedKeywords
        .filter(k => Array.isArray(k) && k.length >= 2 && typeof k[0] === 'string' && k[0].length > 0)
        .map(k => ([k[0].trim(), Math.max(10, Math.min(100, Number(k[1]) || 50))] as [string, number]))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50); // Top 50 keywords

      // Normalize weights for word cloud (similar to ReflectiveEchoWall)
      const maxWeight = Math.max(...validKeywords.map(([, weight]) => weight), 1);
      const normalizedKeywords = validKeywords.map(([text, weight]) => ([
        text,
        Math.max(10, (weight / maxWeight) * 100)
      ] as [string, number]));

      setWordCloudKeywords(normalizedKeywords);
    } catch (error) {
      console.error('Error extracting keywords:', error);
      setWordCloudKeywords([]);
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  // Update keywords when messages change (both user and AI)
  useEffect(() => {
    const messageCount = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant').length;
    
    if (messageCount >= 3 && messageCount !== lastKeywordExtractionRef.current) {
      // Debounce keyword extraction to avoid too many API calls
      const timer = setTimeout(() => {
        extractKeywords();
      }, 2000);
      return () => clearTimeout(timer);
    } else if (messageCount < 3) {
      setWordCloudKeywords([]);
      lastKeywordExtractionRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  return (
    <div className={`flex min-h-0 overflow-hidden bg-slate-50 ${embedded ? 'h-full' : 'h-full max-h-full rounded-xl border border-slate-200 shadow-sm'}`} style={embedded ? {} : { height: '100%', maxHeight: '100%' }}>
      {/* Left Bar: AI Usage Statistics - Conditionally visible based on showLeftPanel */}
      {(showLeftPanel ?? !embedded) && (
      <div
        ref={leftSidebarRef}
        className={`relative flex flex-shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-out ${
          statsPanelCollapsed ? 'w-11' : 'w-1/4 min-w-[240px] max-w-[20rem]'
        }`}
      >
        {statsPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setStatsPanelCollapsed(false)}
            className="flex h-full w-full flex-col items-center gap-3 bg-slate-50 py-3 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            title="Show usage statistics"
            aria-label="Show usage statistics"
            aria-expanded="false"
          >
            <span className="rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
              <BarChart3 className="h-3.5 w-3.5 text-slate-700" />
            </span>
            <span className="select-none text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500" style={{ writingMode: 'vertical-rl' }}>
              Usage
            </span>
            <ChevronRight className="mt-auto h-4 w-4" />
          </button>
        ) : (
          <>
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 pr-5">
              <div className="flex min-w-0 items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 flex-shrink-0 text-slate-700" />
                <h2 className="truncate text-sm font-semibold text-slate-900">AI Usage Statistics</h2>
                {isActive && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" title="Live session" />
                )}
              </div>
              {!isTeacher && (
                <button
                  type="button"
                  onClick={() => void handleOpenHinaAnalysis()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                  title="How I use AI"
                  aria-label="How I use AI"
                >
                  <Network className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 pr-5">
                <div className="min-h-0 flex-1 overflow-hidden">
                <SessionInsightDeck
                  messages={messages}
                  currentPhase={currentPhase}
                />
                </div>

                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="rounded-md border border-slate-200 bg-slate-50 p-1">
                        <Sparkles className="h-3.5 w-3.5 text-slate-700" />
                      </span>
                      <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="text-xs font-semibold text-slate-900">Keywords</h3>
                          {wordCloudKeywords.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
                              {wordCloudKeywords.length}
                            </span>
                          )}
                      </div>
                    </div>
                    {wordCloudKeywords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowExpandedWordCloud(true)}
                        className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        title="View expanded keyword map"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1">
                  {isGeneratingKeywords ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                      <p className="text-[11px] text-slate-500">Extracting keywords…</p>
                    </div>
                  ) : messages.filter(msg => msg.role === 'user' || msg.role === 'assistant').length < 3 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 px-3 ring-1 ring-inset ring-slate-200">
                      <p className="text-center text-[11px] font-medium text-slate-700">Keep the conversation going</p>
                      <p className="text-center text-[11px] leading-snug text-slate-500">A topic word cloud appears after a few messages</p>
                    </div>
                  ) : wordCloudKeywords.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200">
                      <p className="text-center text-[11px] text-slate-500">No keywords yet. Generating…</p>
                    </div>
                  ) : (
                    <WordCloudCanvas
                      compact
                      words={wordCloudKeywords}
                      onWordClick={(word) => {
                        setActiveKeyword(word);
                        setShowExpandedWordCloud(true);
                      }}
                    />
                  )}
                  </div>
                </section>
            </div>

            <button
              type="button"
              onClick={() => setStatsPanelCollapsed(true)}
              className="group absolute inset-y-0 right-0 z-10 flex w-4 items-center justify-center"
              title="Hide usage statistics"
              aria-label="Hide usage statistics"
              aria-expanded="true"
            >
              <span className="absolute inset-y-0 right-0 w-px bg-slate-200 transition-colors group-hover:w-1 group-hover:bg-slate-400" />
              <span className="relative flex h-11 w-4 items-center justify-center rounded-l-md border border-r-0 border-slate-200 bg-white text-slate-500 shadow-sm transition-colors group-hover:bg-slate-50 group-hover:text-slate-800">
                <ChevronLeft className="h-3.5 w-3.5" />
              </span>
            </button>
          </>
        )}
      </div>
      )}

      {/* Teacher Task Panel - Only visible for teachers */}
      {leftPanelVisible && (
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm overflow-hidden">
        {/* Header */}
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Task Panel</h2>
            <p className="text-xs mt-0.5 text-slate-600">Learning Progress</p>
          </div>

          {/* Learning Objectives */}
          <div className="p-3 border-b border-gray-200 flex-1 overflow-y-auto">
            <div className="space-y-3">
              {/* Learning Process Framework - 7-Stage Hybrid Cognitive–Metacognitive Framework */}
              {isTeacher && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Learning Process Framework</span>
                  </h3>
                  {calculationComplete && (
                    <div className="flex items-center space-x-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      <CheckCircle className="h-3 w-3" />
                      <span>Auto-detected</span>
                    </div>
                  )}
                </div>
                
                {/* Show stages only if there are messages and calculation is complete, or if calculation is in progress */}
                {messages.length === 0 && !isCalculating ? (
                  <div className="text-center py-8 px-4">
                    <div className="text-gray-400 mb-2">
                      <Layers className="h-8 w-8 mx-auto opacity-50" />
                    </div>
                    <p className="text-xs text-gray-500 italic">
                      Stages will appear after you send your first prompt and calculation completes
                    </p>
                  </div>
                ) : (
                  <>
                    {!calculationComplete && (
                      <p className="text-xs text-gray-500 mb-2 italic">
                        Stage will be automatically determined after calculation
                      </p>
                    )}
                    <div className="space-y-2">
                      {phases.map((phase, index) => {
                    const Icon = phase.icon;
                    const isActive = phase.id === currentPhase;
                    const stageColors = [
                      'from-amber-500 to-orange-500', // Orient
                      'from-blue-500 to-cyan-500',    // Clarify
                      'from-purple-500 to-pink-500',  // Strategize
                      'from-green-500 to-emerald-500', // Execute
                      'from-indigo-500 to-blue-500',  // Monitor
                      'from-teal-500 to-cyan-500',    // Verify
                      'from-violet-500 to-purple-500' // Reflect
                    ];
                    const borderColors = [
                      'border-amber-400', 'border-blue-400', 'border-purple-400',
                      'border-green-400', 'border-indigo-400', 'border-teal-400', 'border-violet-400'
                    ];
                    const bgColors = [
                      'bg-amber-50', 'bg-blue-50', 'bg-purple-50',
                      'bg-green-50', 'bg-indigo-50', 'bg-teal-50', 'bg-violet-50'
                    ];
                    
                    return (
                      <div
                        key={phase.id}
                        className={`p-2.5 rounded-lg border-2 transition-all ${
                          isActive
                            ? `${bgColors[index]} ${borderColors[index]} shadow-md`
                            : 'bg-gray-50 border-gray-200'
                        } ${!calculationComplete ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start space-x-2">
                          <div className={`p-1 rounded-md ${
                            isActive 
                              ? `bg-gradient-to-br ${stageColors[index]} text-white` 
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className={`font-semibold text-xs ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                                Stage {index + 1}: {phase.name}
                              </p>
                            </div>
                            <p className="text-xs text-gray-600 mb-1">{phase.description}</p>
                            {!calculationComplete && isCalculating && (
                              <div className="mt-1.5 flex items-center space-x-1 text-xs text-gray-400">
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                                <span>Calculating...</span>
                              </div>
                            )}
                            {!calculationComplete && !isCalculating && (
                              <div className="mt-1.5 text-xs text-gray-400 italic">
                                Waiting for calculation...
                              </div>
                            )}
                          </div>
                          {isActive && (
                            <div className={`w-2 h-2 rounded-full animate-pulse bg-gradient-to-br ${stageColors[index]}`} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500 italic">
                        ACE-7 Learning Intelligence Model: Awareness → Construction → Evolution
                      </p>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* Role Cards */}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                  <Brain className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Role Cards</span>
                </h3>
                <div className="space-y-2">
                  {roleCards.map((role) => {
                    const Icon = role.icon;
                    const isActive = activeRole === role.id;
                    const colorClasses = {
                      blue: isActive ? 'bg-blue-50 border-blue-400' : 'bg-blue-50 border-blue-200 hover:border-blue-300',
                      purple: isActive ? 'bg-purple-50 border-purple-400' : 'bg-purple-50 border-purple-200 hover:border-purple-300',
                      green: isActive ? 'bg-green-50 border-green-400' : 'bg-green-50 border-green-200 hover:border-green-300',
                      orange: isActive ? 'bg-orange-50 border-orange-400' : 'bg-orange-50 border-orange-200 hover:border-orange-300',
                    };
                    return (
                      <div
                        key={role.id}
                        className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${colorClasses[role.color as keyof typeof colorClasses]}`}
                        onClick={() => handleRoleClick(role.id)}
                      >
                        <div className="flex items-start space-x-2">
                          <div className={`p-1 rounded-lg ${
                            role.color === 'blue' ? 'bg-blue-100' :
                            role.color === 'purple' ? 'bg-purple-100' :
                            role.color === 'green' ? 'bg-green-100' :
                            'bg-orange-100'
                          }`}>
                            <Icon className={`h-3 w-3 ${
                              role.color === 'blue' ? 'text-blue-600' :
                              role.color === 'purple' ? 'text-purple-600' :
                              role.color === 'green' ? 'text-green-600' :
                              'text-orange-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-xs ${
                              isActive ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {role.name}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                              {role.description}
                            </p>
                          </div>
                          {isActive && (
                            <CheckCircle className="h-3 w-3 text-gray-600 flex-shrink-0 mt-0.5" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Middle Column: Chat Area */}
      <div className="flex-1 flex flex-col bg-transparent overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <MessageSquare className="h-3 w-3 flex-shrink-0" />
              <span>AI Tutor</span>
              {courseCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{courseCode}</span>
                </>
              )}
            </div>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitSessionTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitSessionTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelSessionTitleEdit();
                  }
                }}
                maxLength={80}
                aria-label="Session name"
                className={`mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-900 outline-none ring-2 ring-slate-200 ${
                  embedded ? 'text-sm' : 'text-base'
                }`}
              />
            ) : (
              <TutorSessionTitle
                title={currentSessionTitle}
                displayedTitle={displayedTitle}
                isPlaceholder={!titleGenerated && currentSessionTitle === DEFAULT_SESSION_TITLE}
                isGenerating={isGeneratingTitle}
                isTyping={isTypingTitle}
                compact={embedded}
                onRename={startEditSessionTitle}
              />
            )}
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {promptCount} prompt{promptCount === 1 ? '' : 's'}
              {currentTurn > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  Turn {currentTurn}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleShowHistory}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showHistory
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:text-slate-900'
              }`}
              title={showHistory ? 'Hide history' : 'Open chat history'}
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{showHistory ? 'Hide' : 'History'}</span>
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetConversation}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900"
                title="Start a new chat"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => void handleSaveConversation()}
                disabled={isSaving}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  isSaving
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : isSaved
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-700'
                }`}
                title={isSaved ? 'Conversation autosaved' : 'Autosaving conversation'}
              >
                {isSaving ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                ) : isSaved ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Autosave'}
                </span>
              </button>
            )}
          </div>
        </div>
        
        {/* Chat History Modal */}
        {showHistory && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeHistory();
              }
            }}
          >
            <div 
              className={`bg-white rounded-xl shadow-sm flex flex-col overflow-hidden animate-scale-in border border-slate-200 min-h-0 ${
                isLoadingHistory
                  ? 'w-full max-w-sm py-4 px-5'
                  : 'w-full max-w-6xl h-[min(720px,calc(100dvh-1.5rem))] sm:h-[min(760px,calc(100dvh-2rem))]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {isLoadingHistory ? (
                /* Tiny loading page with progress (compact so it fits on screen) */
                <div className="flex flex-col items-center justify-center gap-2 py-1">
                  <div className="p-1.5 bg-slate-100 rounded-full shrink-0">
                    <History className="h-5 w-5 text-slate-700" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 shrink-0">Loading history</h3>
                  <div className="w-full max-w-[180px] h-1 bg-gray-200 rounded-full overflow-hidden shrink-0">
                    <div 
                      className="h-full bg-slate-700 rounded-full transition-all duration-300"
                      style={{ width: `${historyLoadPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 text-center min-h-[1rem] leading-tight shrink-0">
                    {historyLoadProgress || 'Loading...'}
                  </p>
                </div>
              ) : (
                <>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 bg-slate-900 rounded-lg flex-shrink-0">
                    <History className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900">Chat History</h3>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">
                      {courseId || courseCode
                        ? 'Past conversations in this course'
                        : 'Browse and restore your past conversations'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeHistory}
                  className="p-2 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {/* Modal Content */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Session List Sidebar */}
                <div className={`${selectedSession ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 bg-slate-50 flex-col min-h-0`}>
                  <div className="p-3 border-b border-slate-200 bg-white flex-shrink-0 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <MessageSquare className="h-4 w-4 text-slate-700" />
                        <h4 className="text-sm font-semibold text-gray-900">Your Sessions</h4>
                      </div>
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        {filteredHistory.length}
                      </span>
                    </div>
                    <label className="relative block">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="search"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search sessions..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 text-gray-900 placeholder:text-gray-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>
                    <p className="text-xs text-gray-500">
                      {(courseId || courseCode) ? 'Saved in this course' : 'All saved conversations'}
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {chatHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                        <div className="p-4 bg-white rounded-full mb-4 border border-slate-200">
                          <History className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {courseId || courseCode ? 'No history for this course' : 'No chat history found'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {courseId || courseCode
                            ? 'Save a conversation in this course to see it here'
                            : 'Start a conversation to see it here'}
                        </p>
                      </div>
                    ) : filteredHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                        <div className="p-4 bg-white rounded-full mb-4 border border-slate-200">
                          <Search className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1">No matching sessions</p>
                        <p className="text-xs text-gray-500">Try a different search term</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-4">
                        {groupedHistory.map((group) => (
                          <div key={group.label}>
                            <div className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm px-1 pb-1.5 dark:bg-slate-950/95">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {group.label}
                              </p>
                            </div>
                            <div className="space-y-2">
                              {group.sessions.map((session) => {
                                const isSelected = selectedSession?.id === session.id;
                                const isCurrent = currentSessionId === session.id;
                                return (
                                  <button
                                    key={session.id}
                                    type="button"
                                    className={`w-full text-left p-3 rounded-xl transition-all border ${
                                      isSelected
                                        ? 'bg-white border-slate-900 shadow-sm ring-1 ring-slate-900/10'
                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                    }`}
                                    onClick={() => handleSelectSession(session)}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-semibold text-gray-900 truncate">
                                          {session.title}
                                        </h4>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                          <span className="inline-flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {formatDate(session.created_at)}
                                          </span>
                                          <span className="inline-flex items-center gap-1">
                                            <ClockIcon className="h-3 w-3" />
                                            {formatTime(session.created_at)}
                                          </span>
                                        </div>
                                      </div>
                                      {isSelected ? (
                                        <span className="ml-1 p-1 bg-slate-900 rounded-full flex-shrink-0">
                                          <CheckCircle className="h-3 w-3 text-white" />
                                        </span>
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                                      )}
                                    </div>
                                    {(isSelected || isCurrent) && (
                                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                                        <span className="inline-flex items-center text-xs font-medium text-slate-600">
                                          <span className="w-1.5 h-1.5 bg-slate-700 rounded-full mr-1.5" />
                                          {isSelected ? 'Viewing' : 'Current chat'}
                                        </span>
                                        {isCurrent && (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                            Open
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Display Area */}
                <div className={`${selectedSession ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white min-h-0 min-w-0`}>
                  {selectedSession ? (
                    <>
                      {/* Session Header */}
                      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={handleCloseSessionView}
                            className="md:hidden mt-0.5 p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
                            aria-label="Back to sessions"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base font-semibold text-gray-900 truncate">{selectedSession.title}</h4>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(selectedSession.created_at)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <ClockIcon className="h-3 w-3" />
                                {formatTime(selectedSession.created_at)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {isLoadingSession ? 'Loading…' : `${sessionMessages.length} message${sessionMessages.length !== 1 ? 's' : ''}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Messages Container */}
                      <div className="flex-1 overflow-y-auto min-h-0 p-4 bg-slate-50">
                        {isLoadingSession ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center space-y-4">
                              <div className="w-12 h-12 border-4 border-gray-200 border-t-slate-700 rounded-full animate-spin"></div>
                              <div className="text-center">
                                <p className="text-sm font-medium text-gray-900">Loading messages...</p>
                                <p className="text-xs text-gray-500 mt-1">Please wait</p>
                              </div>
                            </div>
                          </div>
                        ) : sessionMessages.length === 0 ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <div className="p-4 bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                <MessageSquare className="h-8 w-8 text-gray-400" />
                              </div>
                              <p className="text-sm font-medium text-gray-900 mb-1">No messages in this session</p>
                              <p className="text-xs text-gray-500">This session appears to be empty</p>
                            </div>
                          </div>
                        ) : (
                          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                            {sessionMessages.map((message) => (
                              <TutorMessageBubble
                                key={message.id}
                                message={{
                                  id: message.id,
                                  role: message.role,
                                  content: message.content,
                                  timestamp: message.created_at,
                                  turnNumber: message.turn_number,
                                  detectedStage: message.metadata?.detectedStage,
                                  messageRole: message.metadata?.messageRole,
                                  apiUsed: message.metadata?.apiUsed,
                                  attachedFileName: message.metadata?.attachedFileName,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500 hidden sm:block">
                          Restore this conversation into the current tutor chat.
                        </p>
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            onClick={handleCloseSessionView}
                            className="hidden md:inline-flex px-3 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={handleRestoreSession}
                            disabled={isLoadingSession || sessionMessages.length === 0}
                            className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all shadow-sm inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span>Restore session</span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-slate-50">
                      <div className="text-center p-8 max-w-sm">
                        <div className="p-5 bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-5 shadow-sm border border-slate-200">
                          <History className="h-10 w-10 text-slate-500" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">Select a session</h4>
                        <p className="text-sm text-gray-600 mb-1">Choose a conversation on the left to preview its messages.</p>
                        <p className="text-xs text-gray-500">You can restore any session to continue chatting.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages Area */}
        <div className={`flex-1 ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'} min-h-0 bg-slate-50 select-text`}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex justify-center">
              <div className="w-32 h-32 rounded-full flex items-center justify-center overflow-hidden">
                <img 
                  src="/images/icon.png" 
                  alt="AI Tutor" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className={`mx-auto flex w-full max-w-3xl flex-col ${embedded ? 'gap-3 px-3 py-3' : 'gap-4 px-4 py-4 sm:px-5'}`}>
            {[...messages]
              .sort((a, b) => {
                if (a.turnNumber !== b.turnNumber) {
                  return (a.turnNumber || 0) - (b.turnNumber || 0);
                }
                if (a.role !== b.role) {
                  return a.role === 'user' ? -1 : 1;
                }
                return a.timestamp.getTime() - b.timestamp.getTime();
              })
              .map((message, index) => (
                <div
                  key={message.id}
                  id={`tutor-msg-${message.id}`}
                  ref={typingMessageId === message.id ? typingAnchorRef : undefined}
                  className={`scroll-mt-4 transition-shadow duration-500 ${
                    highlightedMessageId === message.id
                      ? 'rounded-2xl ring-2 ring-slate-700 ring-offset-2 ring-offset-slate-50'
                      : ''
                  }`}
                >
                <TutorMessageBubble
                  compact={embedded}
                  canEdit={!isLoading && !typingMessageId && message.role === 'user'}
                  editing={editingMessageId === message.id}
                  onStartEdit={setEditingMessageId}
                  onCancelEdit={() => setEditingMessageId(null)}
                  onResend={(messageId, content) => {
                    void handleSendMessage({ text: content, replaceFromId: messageId });
                  }}
                  onReplyQuestion={(question) => {
                    setEditingMessageId(null);
                    setInputValue(question);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  displayedContent={typingMessageId === message.id ? typedReply : undefined}
                  isTyping={typingMessageId === message.id}
                  message={{
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    timestamp: message.timestamp instanceof Date
                      ? message.timestamp.toISOString()
                      : new Date(message.timestamp).toISOString(),
                    turnNumber: message.turnNumber || Math.floor(index / 2) + 1,
                    detectedStage: message.detectedStage,
                    messageRole: message.messageRole,
                    apiUsed: message.apiUsed,
                    attachedFileName: message.attachedFileName,
                  }}
                />
                </div>
              ))}

            {isLoading && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
              <div ref={thinkingAnchorRef}>
                <TutorThinkingIndicator
                  onCancel={handleCancelGeneration}
                  compact={embedded}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-3 shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-2">
          {/* File Upload Button */}
          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.doc,.docx"
              className="hidden"
              disabled={isLoading || isSaving}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isSaving}
              className={`p-2 rounded-lg transition-all ${
                uploadedFile
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isLoading || isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={uploadedFile ? `File attached: ${uploadedFile.file.name}` : 'Upload material for AI to analyze'}
            >
              {uploadedFile ? (
                <Paperclip className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </button>
          </div>

          <TutorModeToggle
            value={tutorMode}
            onChange={setTutorMode}
            disabled={isLoading || isSaving}
            compact={embedded}
          />
          
          {/* File Display Tab - Shows uploaded file name */}
          {uploadedFile && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 text-white rounded-md text-xs">
                <FileText className="h-3.5 w-3.5" />
                <span className="max-w-[150px] truncate">{uploadedFile.file.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="ml-1 hover:text-red-300 transition-colors"
                  title="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          
          <textarea
              ref={textareaRef}
              className="flex-1 resize-none border-2 border-gray-300 rounded-lg p-1.5 text-sm text-gray-900 placeholder:text-xs placeholder:text-gray-400 outline-none transition-all overflow-y-auto focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              style={{ minHeight: '32px', maxHeight: '150px', marginTop: '5px' } as React.CSSProperties}
              onFocus={(e) => {
                e.target.style.borderColor = '#64748b';
                e.target.style.boxShadow = '0 0 0 2px rgba(148, 163, 184, 0.25)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#D1D5DB';
                e.target.style.boxShadow = 'none';
              }}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyPress={handleKeyPress}
            disabled={isLoading || isSaving || !!editingMessageId || !!typingMessageId}
          />
          {isLoading || typingMessageId ? (
            <button
              type="button"
              onClick={handleCancelGeneration}
              className="p-2.5 rounded-lg transition-all flex-shrink-0 bg-red-600 shadow-sm hover:bg-red-700"
              title={typingMessageId ? 'Show full reply' : 'Cancel'}
            >
              <X className="h-4 w-4 text-white" />
            </button>
          ) : (
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isSaving || !!editingMessageId}
              className={`p-2.5 rounded-lg transition-all flex-shrink-0 ${
              !inputValue.trim() || isSaving || editingMessageId
                ? 'cursor-not-allowed bg-slate-400'
                  : 'bg-slate-900 shadow-sm hover:bg-slate-800'
            }`}
              title="Send"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
          )}
        </div>
        </div>
      </div>

      {/* Right Column: Thinking Aid Area */}
      {rightPanelVisible && (
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">Thinking Aids</h2>
          <p className="text-xs text-slate-600 mt-0.5">Question Tree & Evidence</p>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-3">
          {/* Learning Process Intelligence Panel */}
          {isTeacher && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Learning Process Intelligence Panel</h3>
                  </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setShowDetailedAnalysis(true)}
                  className="p-1 hover:bg-indigo-100 rounded transition-colors"
                  title="View detailed analysis"
                >
                  <ZoomIn className="h-3.5 w-3.5 text-indigo-600" />
                </button>
                <button
                  onClick={() => setActiveJourneyChartIndex((activeJourneyChartIndex - 1 + 8) % 8)}
                  className="p-1 hover:bg-indigo-100 rounded transition-colors"
                  title="Previous chart"
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-gray-600" />
                </button>
                <span className="text-xs text-gray-600 px-2">
                  {activeJourneyChartIndex + 1}/8
                </span>
                <button
                  onClick={() => setActiveJourneyChartIndex((activeJourneyChartIndex + 1) % 8)}
                  className="p-1 hover:bg-indigo-100 rounded transition-colors"
                  title="Next chart"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </button>
                </div>
                </div>
            <p className="text-xs text-gray-600 mb-3">Your learning process intelligence visualization</p>
            
            {/* Calculation Status Indicator */}
            {!calculationComplete && (
              <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2">
                {isCalculating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-amber-700 font-medium">Calculating stage scores...</span>
                  </>
                ) : (
                  <>
                    <Info className="h-4 w-4 text-amber-600" />
                    <span className="text-xs text-amber-700">Scores will appear after calculation completes</span>
                  </>
                )}
              </div>
            )}
            
            {(() => {
              const labels = phases.map(phase => phase.name);
              // Only show values after calculation is complete
              const values = calculationComplete 
                ? phases.map(phase => stagePercentages[phase.id as keyof typeof stagePercentages] || 0)
                : phases.map(() => 0);
              // Updated colors for 7 stages
              const colors = ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6'];
              const totalMessages = messages.filter(m => m.role === 'assistant').length;
              const chartIcons = [BarChart3, PieChart, AreaChart, FileText, TrendingUp, ScatterChart, Sparkles, PieChart];
              const chartNames = [
                'Progress Bars',
                'Enhanced Donut',
                'Rose (Polar Bar)',
                'Treemap',
                'Funnel',
                'Lollipop',
                'Sunburst',
                'KSA+Meta Radar'
              ];
              const ActiveIcon = chartIcons[activeJourneyChartIndex];
              
              // KSA + Meta-Cognition radar data
              const ksaRadarLabels = [
                'Knowledge', 'Skill', 'Attitude', 'Meta-Monitor', 'Meta-Regulate', 
                'Meta-Evaluate', 'Meta-Reflect', 'Meta-Transfer'
              ];
              const ksaRadarValues = [
                (ksaScores.knowledge.conceptUnderstanding + ksaScores.knowledge.reasoningApplication + ksaScores.knowledge.evidenceSupport) / 3,
                (ksaScores.skill.planningAbility + ksaScores.skill.reasoningConstruction + ksaScores.skill.expressionOrganization + ksaScores.skill.verificationExplanation) / 4,
                (ksaScores.attitude.goalClarity + ksaScores.attitude.persistence + ksaScores.attitude.growthMindset) / 3,
                ksaScores.metacognition.monitor,
                ksaScores.metacognition.regulate,
                ksaScores.metacognition.evaluate,
                ksaScores.metacognition.reflection,
                ksaScores.metacognition.transfer
              ];

              const renderJourneyChart = (index: number) => {
                switch(index) {
                  case 0:
                    return (
                      <div className="space-y-2.5">
                        {phases.map((phase, idx) => {
                          const Icon = phase.icon;
                          const percentage = calculationComplete 
                            ? (stagePercentages[phase.id as keyof typeof stagePercentages] || 0)
                            : 0;
                          return (
                            <div key={phase.id} className="bg-white rounded-lg p-2 border" style={{ borderColor: colors[idx] + '40' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5">
                                  <Icon className="h-3 w-3" style={{ color: colors[idx] }} />
                                  <span className="text-xs font-semibold text-gray-900">{phase.name}</span>
                  </div>
                                {calculationComplete && percentage > 0 ? (
                                  <span className="text-xs font-bold" style={{ color: colors[idx] }}>{percentage.toFixed(1)}%</span>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                </div>
                              {calculationComplete && percentage > 0 ? (
                                <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: colors[idx] + '20' }}>
                                  <div 
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${percentage}%`, background: `linear-gradient(to right, ${colors[idx]}, ${colors[idx]}DD)` }}
                                  />
                                </div>
                              ) : (
                                <div className="w-full rounded-full h-2.5 overflow-hidden bg-gray-100">
                                  <div className="h-full w-0 bg-gray-200" />
                                </div>
                              )}
              </div>
                          );
                        })}
                        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-center space-x-2 text-xs text-gray-600">
                          <span className="font-medium">Total Messages:</span>
                          <span className="font-bold text-indigo-700">{totalMessages}</span>
                  </div>
                </div>
                    );

                  case 1: // Enhanced Donut
                    return (
                      <Plot
                        data={[{
                          type: 'pie',
                          values: values,
                          labels: labels,
                          marker: {
                            colors: colors,
                            line: { color: '#fff', width: 3 }
                          },
                          textinfo: 'label+percent',
                          textposition: 'outside',
                          hole: 0.65,
                          rotation: 45,
                          hoverinfo: 'label+value+percent',
                          hovertemplate: '<b>%{label}</b><br>Percentage: %{percent}<br>Value: %{value}%<extra></extra>',
                          pull: [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
                        }] as any}
                        layout={{
                          showlegend: true,
                          height: 220,
                          margin: { l: 10, r: 10, t: 30, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif', color: '#1F2937' },
                          legend: { 
                            font: { size: 10, color: '#4B5563' }, 
                            orientation: 'h', 
                            x: 0.5, 
                            y: -0.15, 
                            xanchor: 'center',
                            bgcolor: 'rgba(255,255,255,0.8)',
                            bordercolor: '#E5E7EB',
                            borderwidth: 1
                          },
                          annotations: [{
                            text: `<b>Process<br>Total: ${totalMessages}</b>`,
                            showarrow: false,
                            x: 0.5,
                            y: 0.5,
                            font: { size: 14, color: '#6B7280', family: 'Inter, system-ui, sans-serif' },
                            xref: 'paper',
                            yref: 'paper'
                          }]
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 2: // Rose (Polar Bar)
                    return (
                      <Plot
                        data={[{
                          type: 'barpolar',
                          r: values,
                          theta: labels,
                          marker: { color: colors, line: { color: '#fff', width: 2 } },
                          hovertemplate: '<b>%{theta}</b><br>%{r}%<extra></extra>',
                        }] as any}
                        layout={{
                          polar: {
                            angularaxis: { direction: 'clockwise', tickfont: { size: 9 } },
                            radialaxis: { visible: true, gridcolor: '#E5E7EB', range: [0, 100] }
                          },
                          height: 220,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 3: // Treemap
                    return (
                      <Plot
                        data={[{
                          type: 'treemap',
                          labels: labels,
                          parents: labels.map(() => 'Learning Stages'),
                          values: values,
                          marker: { colors: colors },
                          hovertemplate: '<b>%{label}</b><br>%{value}%<extra></extra>',
                        }] as any}
                        layout={{
                          height: 220,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 4: // Funnel
                    return (
                      <Plot
                        data={[{
                          type: 'funnel',
                          y: labels,
                          x: values,
                          marker: { color: colors, line: { color: '#fff', width: 1 } },
                          text: values.map(v => `${v}%`),
                          textposition: 'inside',
                          hovertemplate: '<b>%{y}</b><br>%{x}%<extra></extra>',
                        }] as any}
                        layout={{
                          height: 220,
                          margin: { l: 80, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 5: // Lollipop chart
                    return (
                      <Plot
                        data={[
                          {
                            type: 'bar',
                            x: values,
                            y: labels,
                            orientation: 'h',
                            marker: { color: '#E5E7EB' },
                            hoverinfo: 'skip',
                            showlegend: false,
                          },
                          {
                            type: 'scatter',
                            x: values,
                            y: labels,
                            mode: 'markers',
                            marker: { size: values.map(v => v * 2 + 12), color: colors, line: { color: '#fff', width: 2 } },
                            text: labels.map((l, i) => `${l}: ${values[i]}%`),
                            hovertemplate: '<b>%{text}</b><extra></extra>',
                            showlegend: false,
                          }
                        ] as any}
                        layout={{
                          height: 220,
                          margin: { l: 80, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { tickfont: { size: 9 }, showgrid: true, gridcolor: '#F3F4F6', title: { text: 'Percentage (%)', font: { size: 9 } }, range: [0, 100] },
                          yaxis: { tickfont: { size: 9 }, automargin: true }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 6: // Sunburst
                    return (
                      <Plot
                        data={[{
                          type: 'sunburst',
                          labels: labels,
                          parents: labels.map(() => ''),
                          values: values,
                          branchvalues: 'total',
                          marker: { colors: colors },
                          hovertemplate: '<b>%{label}</b><br>%{value}%<extra></extra>',
                        }] as any}
                        layout={{
                          height: 220,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 7: // KSA + Meta-Cognition Radar Chart
                    return (
                      <div className="space-y-2">
                        <Plot
                          data={[{
                            type: 'scatterpolar',
                            r: [...ksaRadarValues, ksaRadarValues[0]],
                            theta: [...ksaRadarLabels, ksaRadarLabels[0]],
                            fill: 'toself',
                            fillcolor: 'rgba(99, 102, 241, 0.15)',
                            line: { color: '#6366F1', width: 2.5 },
                            marker: { color: '#6366F1', size: 8 },
                            hovertemplate: '<b>%{theta}</b><br>Score: %{r:.1f}/5<extra></extra>',
                            name: 'KSA+Meta Scores'
                          }] as any}
                          layout={{
                            polar: {
                              bgcolor: 'rgba(255,255,255,0.0)',
                              radialaxis: { 
                                gridcolor: '#E5E7EB', 
                                linecolor: '#E5E7EB', 
                                tickfont: { size: 8 },
                                range: [0, 5],
                                tickmode: 'linear',
                                tick0: 0,
                                dtick: 1
                              },
                              angularaxis: { 
                                gridcolor: '#E5E7EB', 
                                linecolor: '#E5E7EB', 
                                tickfont: { size: 8 }
                              }
                            },
                            height: 220,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 9, family: 'Inter, system-ui, sans-serif' },
                            showlegend: false
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                        <div className="grid grid-cols-2 gap-1.5 text-sm">
                          <div className="bg-blue-50 p-1.5 rounded border border-blue-200">
                            <div className="font-semibold text-blue-700">Knowledge</div>
                            <div className="text-blue-600">{(ksaRadarValues[0]).toFixed(1)}/5</div>
                          </div>
                          <div className="bg-green-50 p-1.5 rounded border border-green-200">
                            <div className="font-semibold text-green-700">Skill</div>
                            <div className="text-green-600">{(ksaRadarValues[1]).toFixed(1)}/5</div>
                          </div>
                          <div className="bg-amber-50 p-1.5 rounded border border-amber-200">
                            <div className="font-semibold text-amber-700">Attitude</div>
                            <div className="text-amber-600">{(ksaRadarValues[2]).toFixed(1)}/5</div>
                          </div>
                          <div className="bg-purple-50 p-1.5 rounded border border-purple-200">
                            <div className="font-semibold text-purple-700">Meta-Cog</div>
                            <div className="text-purple-600">{((ksaRadarValues[3] + ksaRadarValues[4] + ksaRadarValues[5] + ksaRadarValues[6] + ksaRadarValues[7]) / 5).toFixed(1)}/5</div>
                          </div>
                        </div>
                      </div>
                    );

                  default:
                    return null;
                }
              };

              return (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 mb-2 bg-white rounded-lg p-2 border border-gray-200">
                    <ActiveIcon className="h-3 w-3" style={{ color: colors[4] }} />
                    <span className="text-xs font-semibold text-gray-700">{chartNames[activeJourneyChartIndex]}</span>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-indigo-100 shadow-sm">
                    {renderJourneyChart(activeJourneyChartIndex)}
                </div>
                  <div className="flex items-center justify-center space-x-1 pt-1">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveJourneyChartIndex(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === activeJourneyChartIndex 
                            ? 'bg-indigo-600 w-4' 
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        title={chartNames[idx]}
                      />
                    ))}
                </div>
              </div>
              );
            })()}
            
            {/* Calculation Steps Button */}
            <div className="flex justify-center mt-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setShowCalculationSteps(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm"
                title="View calculation steps and values"
              >
                <Calculator className="h-4 w-4" />
                <span className="text-xs font-medium">Calculation Steps</span>
              </button>
            </div>
                  </div>
          )}
          {/* Role Usage Tracker */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Role Usage Tracker</h3>
                </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setActiveChartIndex((activeChartIndex - 1 + 8) % 8)}
                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                  title="Previous chart"
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-gray-600" />
                </button>
                <span className="text-xs text-gray-600 px-2">
                  {activeChartIndex + 1}/8
                </span>
                <button
                  onClick={() => setActiveChartIndex((activeChartIndex + 1) % 8)}
                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                  title="Next chart"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
            </div>

            {(() => {
              const total = Object.values(roleUsageCounts).reduce((sum, c) => sum + c, 0);
              
              if (total === 0) {
                return (
                  <div className="text-center py-6 bg-white rounded-lg border border-gray-200">
                    <Brain className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No role usage tracked yet</p>
                    <p className="text-xs text-gray-400 mt-1">Start using different cognitive roles to see analytics</p>
            </div>
                );
              }

              const labels = roleCards.map(role => role.name);
              const values = roleCards.map(role => roleUsageCounts[role.id as keyof typeof roleUsageCounts]);
              const colors = ['#3B82F6', '#A855F7', '#10B981', '#F97316'];
              const chartIcons = [BarChart3, PieChart, AreaChart, FileText, TrendingUp, ScatterChart, Sparkles, PieChart];
              const chartNames = [
                'Usage Bar Chart',
                'Donut Chart',
                'Rose (Polar Bar)',
                'Treemap',
                'Funnel',
                'Bubble Scatter',
                'Sunburst',
                'Radar (Spider)'
              ];
              const ActiveIcon = chartIcons[activeChartIndex];

              // Helper function to render different charts
              const renderChart = (index: number) => {
                switch(index) {
                  case 0: // Horizontal Bar Chart (like Learning Process Intelligence Panel)
                    return (
            <div className="space-y-2">
                        {roleCards.map((role, idx) => {
                const count = roleUsageCounts[role.id as keyof typeof roleUsageCounts];
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                            <div key={role.id} className="bg-white rounded-lg p-2 border border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx] }} />
                        <span className="text-xs font-semibold text-gray-900">{role.name}</span>
                      </div>
                                <span className="text-xs font-bold" style={{ color: colors[idx] }}>{count} uses ({percentage}%)</span>
                    </div>
                              <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: colors[idx] + '20' }}>
                                <div 
                                  className="h-full rounded-full transition-all duration-700 ease-out"
                                  style={{ width: `${percentage}%`, backgroundColor: colors[idx] }}
                                />
                    </div>
                  </div>
                );
              })}
            </div>
                    );

                  case 1: // Donut Chart
                    return (
                      <Plot
                        data={[{
                          type: 'pie',
                          values: values,
                          labels: labels,
                          marker: {
                            colors: colors,
                            line: { color: '#fff', width: 2 }
                          },
                          textinfo: 'label+percent',
                          textposition: 'outside',
                          hole: 0.6,
                          hoverinfo: 'label+value+percent',
                          hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>',
                        }] as any}
                        layout={{
                          showlegend: true,
                          height: 200,
                          margin: { l: 10, r: 10, t: 20, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' },
                          legend: { font: { size: 9 }, orientation: 'h', x: 0.5, y: -0.1, xanchor: 'center' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 2: // Rose (Polar Bar)
                    return (
                      <Plot
                        data={[{
                          type: 'barpolar',
                          r: values,
                          theta: labels,
                          marker: { color: colors, line: { color: '#fff', width: 2 } },
                          hovertemplate: '<b>%{theta}</b><br>%{r} uses<extra></extra>',
                        }] as any}
                        layout={{
                          polar: {
                            angularaxis: { direction: 'clockwise', tickfont: { size: 9 } },
                            radialaxis: { visible: true, gridcolor: '#E5E7EB' }
                          },
                          height: 200,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 3: // Treemap
                    return (
                      <Plot
                        data={[{
                          type: 'treemap',
                          labels: labels,
                          parents: labels.map(() => 'Roles'),
                          values: values,
                          marker: { colors: colors },
                          hovertemplate: '<b>%{label}</b><br>%{value} uses<extra></extra>',
                        }] as any}
                        layout={{
                          height: 200,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 4: // Scatter plot
                    return (
                      <Plot
                        data={[{
                          type: 'scatter',
                          x: [0, 1, 2, 3],
                          y: values,
                          mode: 'markers+lines',
                          marker: {
                            size: values.map(v => v * 4 + 10),
                            color: colors,
                            line: { color: '#fff', width: 2 },
                            opacity: 0.7
                          },
                          text: labels,
                          hovertemplate: '<b>%{text}</b><br>Value: %{y}<extra></extra>',
                        }] as any}
                        layout={{
                          height: 200,
                          margin: { l: 50, r: 20, t: 20, b: 40 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { showticklabels: false, showgrid: false },
                          yaxis: { tickfont: { size: 9 }, title: { text: 'Usage', font: { size: 9 } } }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 5: // Funnel
                    return (
                      <Plot
                        data={[{
                          type: 'funnel',
                          y: labels,
                          x: values,
                          marker: { color: colors, line: { color: '#fff', width: 1 } },
                          text: values.map(v => `${v}`),
                          textposition: 'inside',
                          hovertemplate: '<b>%{y}</b><br>%{x} uses<extra></extra>',
                        }] as any}
                        layout={{
                          height: 200,
                          margin: { l: 80, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  case 6: // Sunburst
                    return (
                      <Plot
                        data={[{
                          type: 'sunburst',
                          labels: labels,
                          parents: labels.map(() => ''),
                          values: values,
                          branchvalues: 'total',
                          marker: { colors: colors },
                          hovertemplate: '<b>%{label}</b><br>%{value} uses<extra></extra>',
                        }] as any}
                        layout={{
                          height: 200,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );
                  case 7: // Radar (good-looking)
                    return (
                      <Plot
                        data={[{
                          type: 'scatterpolar',
                          r: [...values, values[0]],
                          theta: [...labels, labels[0]],
                          fill: 'toself',
                          fillcolor: 'rgba(59, 130, 246, 0.2)',
                          line: { color: '#3B82F6', width: 2 },
                          marker: { color: '#3B82F6', size: 6 },
                          hovertemplate: '<b>%{theta}</b><br>%{r} uses<extra></extra>',
                        }] as any}
                        layout={{
                          polar: {
                            bgcolor: 'rgba(255,255,255,0.0)',
                            radialaxis: { gridcolor: '#E5E7EB', linecolor: '#E5E7EB', tickfont: { size: 9 } },
                            angularaxis: { gridcolor: '#E5E7EB', linecolor: '#E5E7EB', tickfont: { size: 9 } }
                          },
                          height: 220,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    );

                  default:
                    return null;
                }
              };

              return (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 mb-2 bg-white rounded-lg p-2 border border-gray-200">
                    <ActiveIcon className="h-3 w-3" style={{ color: colors[0] }} />
                    <span className="text-xs font-semibold text-gray-700">{chartNames[activeChartIndex]}</span>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-blue-100 shadow-sm">
                    {renderChart(activeChartIndex)}
                  </div>
                  <div className="flex items-center justify-center space-x-1 pt-1">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveChartIndex(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === activeChartIndex 
                            ? 'bg-blue-600 w-4' 
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        title={chartNames[idx]}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Question Tree */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center space-x-2">
              <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
              <span>Question Tree</span>
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {questionTree.length === 0 ? (
                <div className="text-center py-3 bg-gray-50 rounded-lg">
                  <HelpCircle className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">No questions tracked yet</p>
                </div>
              ) : (
                questionTree.slice(-5).map((q) => (
                  <div key={q.id} className="p-1.5 bg-gray-50 border-l-2 border-purple-300 rounded text-xs text-gray-700">
                    <p className="truncate">{q.question}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      {q.role && (
                        <span className="text-purple-600 text-xs">Role: {q.role}</span>
                      )}
                      {q.stage && (
                        <span className="text-blue-600 text-xs">Stage: {q.stage}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Radar */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center space-x-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span>Error Radar</span>
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {detectedErrors.length === 0 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                  <CheckCircle className="h-6 w-6 text-green-400 mx-auto mb-1.5" />
                  <p className="text-xs text-green-700 font-medium">No errors detected yet</p>
                  <p className="text-xs text-green-600 mt-0.5">Great job!</p>
                </div>
              ) : (
                detectedErrors.map((error, index) => {
                  const severityColors = {
                    'high': 'bg-red-100 border-red-300 text-red-800',
                    'medium': 'bg-orange-100 border-orange-300 text-orange-800',
                    'low': 'bg-yellow-100 border-yellow-300 text-yellow-800'
                  };
                  
                  return (
                    <div key={index} className={`p-2 rounded border-2 ${severityColors[error.severity]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold">{error.type}</p>
                        <span className="text-xs font-bold">×{error.count}</span>
                      </div>
                      <p className="text-xs opacity-90">{error.description}</p>
                      <div className="w-full bg-white bg-opacity-50 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${error.severity === 'high' ? 'bg-red-500' : error.severity === 'medium' ? 'bg-orange-500' : 'bg-yellow-500'}`}
                          style={{ width: `${Math.min(error.count * 25, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Evidence List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center space-x-2">
              <BookOpen className="h-3.5 w-3.5 text-green-600" />
              <span>Structured Evidence</span>
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {structuredEvidence.length === 0 ? (
                <div className="text-center py-3 bg-gray-50 rounded-lg">
                  <BookOpen className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">No evidence collected yet</p>
                </div>
              ) : (
                structuredEvidence.slice(-5).map((evidence, index) => (
                  <div key={index} className="p-2 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-green-700">{evidence.type}</span>
                      <span className="text-xs text-green-600">{(evidence.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">{evidence.content}</p>
                    <span className="text-xs text-blue-600">Stage: {evidence.stage}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Uncertainty Record */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center space-x-2">
              <HelpCircle className="h-3.5 w-3.5 text-orange-600" />
              <span>Uncertainty Record</span>
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {uncertaintyRecord.length === 0 ? (
                <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                  <HelpCircle className="h-5 w-5 text-gray-300 mx-auto mb-1.5" />
                  <p className="text-xs text-gray-500">No uncertainties tracked yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Uncertain expressions will appear here</p>
                </div>
              ) : (
                uncertaintyRecord.slice(-5).map((record, index) => (
                  <div key={index} className="p-2 bg-orange-50 border-l-4 border-orange-400 rounded">
                    <p className="text-xs text-gray-800 mb-1">{record.content}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-blue-600">Stage: {record.stage}</span>
                      <span className="text-xs text-orange-700">Conf: {(record.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-1 mt-1 overflow-hidden">
                      <div 
                        className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${record.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Generate Chatting Report */}
          <div className="border-t border-gray-200 pt-3">
            <button
              onClick={() => {
                if (onGenerateReport && messages.length > 0) {
                  onGenerateReport({
                    messages,
                    sessionTitle: currentSessionTitle,
                    sessionId: currentSessionId,
                    aiUsageSeconds: aiUsageSecondsRef.current,
                    stagePercentages,
                    roleUsageCounts,
                    questionTree,
                    detectedErrors,
                    structuredEvidence,
                    uncertaintyRecord
                  });
                }
              }}
              disabled={messages.length === 0}
              className={`w-full p-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm ${
                messages.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <FileText className="h-3.5 w-3.5" />
                <span className="font-medium text-sm">Generate Chatting Report</span>
              </div>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Detailed Analysis Modal */}
      {showDetailedAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-6xl h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 text-slate-900 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold">Learning Process Intelligence Analysis</h2>
                <p className="text-sm text-indigo-100 mt-1">Multi-level learning insights dashboard</p>
              </div>
              <button
                onClick={() => setShowDetailedAnalysis(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Level Navigation - Enhanced Design */}
            <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 via-blue-50 to-indigo-50 shadow-sm">
              <div className="flex items-center space-x-2 p-3 overflow-x-auto scrollbar-hide">
                {[
                  { 
                    level: 1, 
                    name: 'Micro View', 
                    subtitle: 'Single Prompt',
                    icon: Search,
                    gradient: 'from-blue-500 to-cyan-500',
                    bgGradient: 'from-blue-50 to-cyan-50',
                    borderColor: 'border-blue-300',
                    shadowColor: 'shadow-blue-200'
                  },
                  { 
                    level: 2, 
                    name: 'Meso View', 
                    subtitle: 'Session Trajectory',
                    icon: Activity,
                    gradient: 'from-purple-500 to-pink-500',
                    bgGradient: 'from-purple-50 to-pink-50',
                    borderColor: 'border-purple-300',
                    shadowColor: 'shadow-purple-200'
                  },
                  { 
                    level: 3, 
                    name: 'Macro View', 
                    subtitle: 'Long-term Profile',
                    icon: TrendingUp,
                    gradient: 'from-indigo-500 to-blue-500',
                    bgGradient: 'from-indigo-50 to-blue-50',
                    borderColor: 'border-indigo-300',
                    shadowColor: 'shadow-indigo-200'
                  },
                  { 
                    level: 4, 
                    name: 'Identity & Meta', 
                    subtitle: 'Learning Identity',
                    icon: Brain,
                    gradient: 'from-violet-500 to-purple-500',
                    bgGradient: 'from-violet-50 to-purple-50',
                    borderColor: 'border-violet-300',
                    shadowColor: 'shadow-violet-200'
                  },
                  { 
                    level: 5, 
                    name: 'Recommendations', 
                    subtitle: 'Next Steps',
                    icon: Target,
                    gradient: 'from-emerald-500 to-teal-500',
                    bgGradient: 'from-emerald-50 to-teal-50',
                    borderColor: 'border-emerald-300',
                    shadowColor: 'shadow-emerald-200'
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeAnalysisLevel === item.level;
                  return (
                    <button
                      key={item.level}
                      onClick={() => {
                        setActiveAnalysisLevel(item.level as 1 | 2 | 3 | 4 | 5);
                        // Reset sub-page when changing level
                        if (item.level === 1) setActiveAnalysisSubPage('heatmap');
                        else if (item.level === 2) setActiveAnalysisSubPage('timeseries');
                        else if (item.level === 3) setActiveAnalysisSubPage('radar');
                        else if (item.level === 4) setActiveAnalysisSubPage('identity');
                        else setActiveAnalysisSubPage('recommendations');
                      }}
                      className={`group relative flex flex-col items-center justify-center px-5 py-3.5 rounded-xl transition-all duration-300 whitespace-nowrap min-w-[150px] ${
                        isActive
                          ? `bg-gradient-to-br ${item.gradient} text-white shadow-xl transform scale-105 border-2 ${item.borderColor} ${item.shadowColor}`
                          : `bg-white text-gray-700 hover:bg-gradient-to-br ${item.bgGradient} border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg hover:scale-102`
                      }`}
                    >
                      {/* Active indicator line */}
                      {isActive && (
                        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${item.gradient} rounded-t-xl shadow-sm`} />
                      )}
                      
                      {/* Level number badge */}
                      <div className={`flex items-center justify-center w-9 h-9 rounded-full mb-2.5 transition-all ${
                        isActive
                          ? 'bg-white/25 backdrop-blur-sm shadow-inner'
                          : `bg-gradient-to-br ${item.gradient} text-white shadow-md group-hover:scale-110`
                      }`}>
                        <span className={`text-sm font-extrabold ${isActive ? 'text-white' : 'text-white'}`}>
                          {item.level}
                        </span>
                      </div>
                      
                      {/* Level name */}
                      <div className="flex flex-col items-center mb-1.5">
                        <span className={`font-bold text-sm mb-0.5 ${
                          isActive ? 'text-white drop-shadow-sm' : 'text-gray-900'
                        }`}>
                          {item.name}
                        </span>
                        <span className={`text-sm font-medium ${
                          isActive ? 'text-white/95' : 'text-gray-500'
                        }`}>
                          {item.subtitle}
                        </span>
                      </div>
                      
                      {/* Icon */}
                      <div className={`transition-all ${
                        isActive 
                          ? 'text-white drop-shadow-sm' 
                          : `text-gray-400 group-hover:text-gray-600 group-hover:scale-110`
                      }`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      
                      {/* Active pulse effect */}
                      {isActive && (
                        <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.gradient} opacity-10 animate-pulse`} />
                      )}
                      
                      {/* Hover glow effect */}
                      {!isActive && (
                        <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                      )}
                    </button>
                  );
                })}
              </div>
              
              {/* Progress indicator with level names */}
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        activeAnalysisLevel === level
                          ? 'w-10 bg-indigo-600 shadow-sm'
                          : 'w-2 bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-gray-600">
                    Level {activeAnalysisLevel} of 5
                  </span>
                  <div className="h-4 w-px bg-gray-300" />
                  <span className="text-xs text-gray-500">
                    {activeAnalysisLevel === 1 && 'Micro View'}
                    {activeAnalysisLevel === 2 && 'Meso View'}
                    {activeAnalysisLevel === 3 && 'Macro View'}
                    {activeAnalysisLevel === 4 && 'Identity & Meta'}
                    {activeAnalysisLevel === 5 && 'Recommendations'}
                  </span>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Loading State */}
              {isLoadingCalculations && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading calculation data from Supabase...</p>
                  </div>
                </div>
              )}

              {/* LEVEL 1 - Micro View */}
              {activeAnalysisLevel === 1 && !isLoadingCalculations && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">⭐ LEVEL 1 — Micro View</h3>
                    <p className="text-sm text-gray-600">Single Prompt instant feedback - Learning behaviors in this response</p>
                    {sessionCalculations.length > 0 && (
                      <p className="text-xs text-indigo-600 mt-1">
                        Showing data from {sessionCalculations.length} calculation{sessionCalculations.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Sub-page Navigation */}
                  <div className="flex space-x-2 mb-4 border-b border-gray-200 overflow-x-auto">
                    {[
                      { id: 'heatmap', name: 'Heatmap' },
                      { id: '3dscatter', name: '3D Scatter' },
                      { id: 'violin', name: 'Violin Plot' },
                      { id: 'parallel', name: 'Parallel Coord' },
                      { id: 'boxplot', name: 'Box Plot' },
                      { id: 'sankey', name: 'Sankey Flow' },
                      { id: 'treemap', name: 'Treemap' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAnalysisSubPage(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeAnalysisSubPage === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Chart 1: Heatmap */}
                  {activeAnalysisSubPage === 'heatmap' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Stage Detection Heatmap</h4>
                        {(() => {
                          // Get latest calculation for current prompt
                          const latestCalc = sessionCalculations.length > 0 
                            ? sessionCalculations[sessionCalculations.length - 1] 
                            : null;
                          // Get previous calculation
                          const prevCalc = sessionCalculations.length > 1 
                            ? sessionCalculations[sessionCalculations.length - 2] 
                            : null;
                          // Calculate average
                          const avgScores = phases.map(phase => {
                            if (sessionCalculations.length === 0) return 0;
                            const sum = sessionCalculations.reduce((acc, calc) => 
                              acc + (calc.final_scores?.[phase.id] || 0), 0
                            );
                            return sum / sessionCalculations.length;
                          });

                          const currentScores = latestCalc 
                            ? phases.map(phase => latestCalc.final_scores?.[phase.id] || 0)
                            : phases.map(() => 0);
                          const prevScores = prevCalc 
                            ? phases.map(phase => prevCalc.final_scores?.[phase.id] || 0)
                            : phases.map(() => 0);

                          return (
                            <Plot
                              data={[{
                                type: 'heatmap',
                                z: [currentScores, prevScores, avgScores],
                                x: phases.map(p => p.name),
                                y: ['Current Prompt', 'Previous Prompt', 'Average'],
                                colorscale: [[0, '#E5E7EB'], [0.5, '#6366F1'], [1, '#4F46E5']],
                                showscale: true,
                                hovertemplate: '<b>%{y}</b><br>%{x}: %{z:.2f}<extra></extra>',
                                colorbar: { title: 'Score', titleside: 'right' }
                              }] as any}
                              layout={{
                                height: 300,
                                margin: { l: 120, r: 20, t: 20, b: 80 },
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                                xaxis: { tickangle: -45 }
                              }}
                              config={{ displayModeBar: true, responsive: true }}
                              style={{ width: '100%', height: '100%' }}
                            />
                          );
                        })()}
                      </div>

                      {/* Key Metrics Cards */}
                      <div className="grid grid-cols-3 gap-4">
                        {(() => {
                          const latestCalc = sessionCalculations.length > 0 
                            ? sessionCalculations[sessionCalculations.length - 1] 
                            : null;
                          const finalScores = latestCalc?.final_scores || {};
                          const highestStage = Object.entries(finalScores).reduce((a, b) => 
                            (finalScores[a[0]] || 0) > (finalScores[b[0]] || 0) ? a : b, 
                            ['Orient', 0] as [string, number]
                          );
                          const lowestStage = Object.entries(finalScores).reduce((a, b) => 
                            (finalScores[a[0]] || 0) < (finalScores[b[0]] || 0) ? a : b,
                            ['Reflect', 5] as [string, number]
                          );
                          const phaseName = phases.find(p => p.id === highestStage[0])?.name || 'Unknown';
                          const lowestPhaseName = phases.find(p => p.id === lowestStage[0])?.name || 'Unknown';
                          
                          return (
                            <>
                              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                                <div className="text-xs text-blue-600 font-medium mb-1">Highest Stage</div>
                                <div className="text-2xl font-bold text-blue-900">{phaseName}</div>
                                <div className="text-xs text-blue-700 mt-1">Score: {highestStage[1].toFixed(1)}/5.0</div>
                              </div>
                              <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
                                <div className="text-xs text-amber-600 font-medium mb-1">Needs Improvement</div>
                                <div className="text-2xl font-bold text-amber-900">{lowestPhaseName}</div>
                                <div className="text-xs text-amber-700 mt-1">Score: {lowestStage[1].toFixed(1)}/5.0</div>
                              </div>
                              <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                                <div className="text-xs text-green-600 font-medium mb-1">Total Calculations</div>
                                <div className="text-2xl font-bold text-green-900">{sessionCalculations.length}</div>
                                <div className="text-xs text-green-700 mt-1">In this session</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Stage Score Data Table</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Stage', 'Current', 'Previous', 'Average', 'Change', 'Status'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                phases.map(p => p.name),
                                [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5],
                                [4.0, 2.5, 3.5, 2.0, 2.5, 1.0, 3.0],
                                [3.0, 1.5, 3.8, 1.5, 1.0, 0.5, 2.0],
                                ['-0.5', '-0.5', '+0.5', '-1.0', '-1.0', '-1.0', '-0.5'],
                                ['↓', '↓', '↑', '↓', '↓', '↓', '↓']
                              ],
                              fill: { 
                                color: [
                                  ['white', 'white', 'white', 'white', 'white', 'white', 'white'],
                                  ['#F0F9FF', '#F0F9FF', '#F0F9FF', '#F0F9FF', '#F0F9FF', '#F0F9FF', '#F0F9FF']
                                ]
                              },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], ['.1f'], [], []]
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* AI Insights */}
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-start space-x-3">
                          <Brain className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">AI Analysis & Insights</h4>
                            <ul className="space-y-2 text-sm text-gray-700">
                              <li className="flex items-start">
                                <span className="text-blue-600 mr-2">•</span>
                                <span><strong>Strong Performance:</strong> Execute stage shows clear logical thinking (4.0/5.0)</span>
                              </li>
                              <li className="flex items-start">
                                <span className="text-amber-600 mr-2">•</span>
                                <span><strong>Weak Area:</strong> Verification ability is low (1.5/5.0) - consider adding "why this is correct" analysis</span>
                              </li>
                              <li className="flex items-start">
                                <span className="text-red-600 mr-2">•</span>
                                <span><strong>Missing Stage:</strong> Reflection stage shows 0.0 - no evidence of meta-learning reflection</span>
                              </li>
                              <li className="flex items-start">
                                <span className="text-green-600 mr-2">•</span>
                                <span><strong>Recommendation:</strong> Focus on verification and reflection stages in next prompt</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: 3D Scatter */}
                  {activeAnalysisSubPage === '3dscatter' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">3D Multi-Dimensional Ability Distribution</h4>
                        <Plot
                          data={[{
                            type: 'scatter3d',
                            mode: 'markers',
                            x: [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5],
                            y: [4.0, 2.5, 3.5, 2.0, 2.5, 1.0, 3.0],
                            z: [3.0, 1.5, 3.8, 1.5, 1.0, 0.5, 2.0],
                            text: phases.map(p => p.name),
                            marker: {
                              size: 12,
                              color: [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5],
                              colorscale: 'Viridis',
                              showscale: true,
                              colorbar: { title: 'Overall Score' },
                              line: { color: 'rgba(0,0,0,0.3)', width: 1 }
                            },
                            hovertemplate: '<b>%{text}</b><br>Knowledge: %{x:.1f}<br>Skill: %{y:.1f}<br>Meta: %{z:.1f}<extra></extra>'
                          }] as any}
                          layout={{
                            height: 500,
                            margin: { l: 0, r: 0, t: 20, b: 0 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            scene: {
                              xaxis: { title: 'Knowledge Score' },
                              yaxis: { title: 'Skill Score' },
                              zaxis: { title: 'Metacognition Score' },
                              bgcolor: 'rgba(0,0,0,0)',
                              camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } }
                            },
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* 3D Coordinates Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">3D Coordinates Data</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Stage', 'Knowledge (X)', 'Skill (Y)', 'Meta-Cog (Z)', 'Overall', 'Distance from Origin'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                phases.map(p => p.name),
                                [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5],
                                [4.0, 2.5, 3.5, 2.0, 2.5, 1.0, 3.0],
                                [3.0, 1.5, 3.8, 1.5, 1.0, 0.5, 2.0],
                                [3.5, 2.0, 3.8, 1.5, 1.7, 0.5, 2.5],
                                ['6.1', '3.5', '6.5', '2.6', '3.0', '1.1', '4.3']
                              ],
                              fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], ['.1f'], ['.1f'], ['.1f']]
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Statistical Summary */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Statistical Summary</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mean Knowledge:</span>
                              <span className="font-medium">2.1</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mean Skill:</span>
                              <span className="font-medium">2.6</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mean Meta-Cog:</span>
                              <span className="font-medium">2.0</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Std Dev:</span>
                              <span className="font-medium">1.4</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Clustering Analysis</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span>High Performers: Execute, Strategize</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                              <span>Medium: Orient, Clarify, Monitor</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <span>Low: Verify, Reflect</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 3: Violin Plot */}
                  {activeAnalysisSubPage === 'violin' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Ability Distribution Density (Violin Plot)</h4>
                        <Plot
                          data={phases.map((phase, idx) => ({
                            type: 'violin',
                            y: Array.from({ length: 50 }, () => Math.random() * 5),
                            name: phase.name,
                            box: { visible: true },
                            meanline: { visible: true },
                            fillcolor: `rgba(${idx * 40}, ${100 + idx * 20}, ${200 + idx * 10}, 0.6)`,
                            line: { color: 'black', width: 1 }
                          })) as any}
                          layout={{
                            height: 400,
                            margin: { l: 60, r: 20, t: 20, b: 80 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                            yaxis: { title: 'Score (0-5)', range: [0, 5] },
                            xaxis: { title: 'Learning Stages' },
                            showlegend: true
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Distribution Statistics Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Distribution Statistics</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Stage', 'Mean', 'Median', 'Std Dev', 'Min', 'Max', 'IQR'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                phases.map(p => p.name),
                                [2.5, 2.1, 3.2, 2.8, 1.8, 0.5, 2.3],
                                [2.4, 2.0, 3.1, 2.7, 1.7, 0.4, 2.2],
                                [0.8, 0.7, 0.9, 0.6, 0.5, 0.3, 0.7],
                                [1.2, 1.0, 1.8, 1.5, 0.8, 0.1, 1.0],
                                [4.2, 3.8, 4.8, 4.0, 3.0, 1.2, 3.8],
                                [1.5, 1.2, 1.8, 1.3, 1.0, 0.5, 1.2]
                              ],
                              fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], ['.1f'], ['.1f'], ['.1f'], ['.1f']]
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Distribution Insights */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Distribution Characteristics</h5>
                          <div className="space-y-2 text-xs text-gray-600">
                            <p><strong>Normal Distribution:</strong> Execute, Strategize stages show normal bell curves</p>
                            <p><strong>Skewed Right:</strong> Reflect stage has positive skew (few high scores)</p>
                            <p><strong>High Variance:</strong> Monitor stage shows wide spread (std dev: 0.9)</p>
                            <p><strong>Low Variance:</strong> Reflect stage is concentrated (std dev: 0.3)</p>
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Outlier Detection</h5>
                          <div className="space-y-2 text-xs text-gray-600">
                            <p><strong>High Outliers:</strong> Execute (4.2), Strategize (4.8) - exceptional performance</p>
                            <p><strong>Low Outliers:</strong> Reflect (0.1) - needs attention</p>
                            <p><strong>Consistent:</strong> Clarify, Monitor show stable performance</p>
                            <p><strong>Recommendation:</strong> Focus on bringing Reflect stage to median level</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 4: Parallel Coordinates */}
                  {activeAnalysisSubPage === 'parallel' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Multi-Dimensional Comparison (Parallel Coordinates)</h4>
                      <Plot
                        data={[{
                          type: 'parcoords',
                          line: {
                            color: [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5],
                            colorscale: 'Viridis',
                            showscale: true
                          },
                          dimensions: [
                            { label: 'Knowledge', values: [3.5, 2.0, 4.0, 1.0, 1.5, 0.0, 2.5], range: [0, 5] },
                            { label: 'Skill', values: [4.0, 2.5, 3.5, 2.0, 2.5, 1.0, 3.0], range: [0, 5] },
                            { label: 'Attitude', values: [3.0, 1.5, 3.8, 1.5, 1.0, 0.5, 2.0], range: [0, 5] },
                            { label: 'Meta-Monitor', values: [2.5, 1.0, 3.0, 2.5, 3.5, 0.5, 2.5], range: [0, 5] },
                            { label: 'Meta-Regulate', values: [2.0, 0.5, 2.5, 1.5, 3.0, 0.0, 2.0], range: [0, 5] }
                          ],
                          labelfont: { size: 12 },
                          tickfont: { size: 10 }
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 5: Box Plot */}
                  {activeAnalysisSubPage === 'boxplot' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Stage Score Distribution (Box Plot)</h4>
                      <Plot
                        data={phases.map((phase, idx) => ({
                          type: 'box',
                          y: Array.from({ length: 30 }, () => Math.random() * 5),
                          name: phase.name,
                          boxpoints: 'all',
                          jitter: 0.3,
                          pointpos: -1.8,
                          marker: { color: `rgba(${idx * 40}, ${100 + idx * 20}, ${200 + idx * 10}, 0.6)` },
                          fillcolor: `rgba(${idx * 40}, ${100 + idx * 20}, ${200 + idx * 10}, 0.3)`,
                          line: { color: `rgba(${idx * 40}, ${100 + idx * 20}, ${200 + idx * 10}, 1)` }
                        })) as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 80 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          yaxis: { title: 'Score (0-5)', range: [0, 5] },
                          xaxis: { title: 'Learning Stages' },
                          showlegend: true
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 6: Sankey Diagram */}
                  {activeAnalysisSubPage === 'sankey' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Stage Flow Diagram (Sankey)</h4>
                      <Plot
                        data={[{
                          type: 'sankey',
                          orientation: 'h',
                          node: {
                            pad: 15,
                            thickness: 20,
                            line: { color: 'black', width: 0.5 },
                            label: phases.map(p => p.name),
                            color: ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6']
                          },
                          link: {
                            source: [0, 1, 2, 3, 4, 5],
                            target: [1, 2, 3, 4, 5, 6],
                            value: [35, 20, 40, 10, 15, 5],
                            color: ['rgba(245, 158, 11, 0.4)', 'rgba(59, 130, 246, 0.4)', 'rgba(168, 85, 247, 0.4)', 
                                   'rgba(16, 185, 129, 0.4)', 'rgba(99, 102, 241, 0.4)', 'rgba(20, 184, 166, 0.4)']
                          }
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 7: Treemap */}
                  {activeAnalysisSubPage === 'treemap' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Ability Proportion (Treemap)</h4>
                      <Plot
                        data={[{
                          type: 'treemap',
                          labels: phases.map(p => p.name),
                          parents: phases.map(() => ''),
                          values: [35, 20, 40, 10, 15, 5, 25],
                          marker: {
                            colors: ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6'],
                            line: { color: 'white', width: 2 }
                          },
                          textinfo: 'label+value+percent parent',
                          hovertemplate: '<b>%{label}</b><br>Value: %{value}<br>Percentage: %{percentParent:.1%}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 12, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* LEVEL 2 - Meso View */}
              {activeAnalysisLevel === 2 && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">⭐ LEVEL 2 — Meso View</h3>
                    <p className="text-sm text-gray-600">Task/Session trajectory tracking - Process visualization</p>
                  </div>

                  {/* Sub-page Navigation */}
                  <div className="flex space-x-2 mb-4 border-b border-gray-200 overflow-x-auto">
                    {[
                      { id: 'timeseries', name: 'Time Series' },
                      { id: 'network', name: 'Network Graph' },
                      { id: 'waterfall', name: 'Waterfall' },
                      { id: 'streamgraph', name: 'Streamgraph' },
                      { id: 'gantt', name: 'Timeline' },
                      { id: 'bubble', name: 'Bubble Chart' },
                      { id: 'contour', name: 'Contour Map' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAnalysisSubPage(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeAnalysisSubPage === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Chart 1: Time Series */}
                  {activeAnalysisSubPage === 'timeseries' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Process Trajectory Time Series</h4>
                        <Plot
                          data={phases.slice(0, 5).map((phase, idx) => ({
                            type: 'scatter',
                            mode: 'lines+markers',
                            x: Array.from({ length: 10 }, (_, i) => i * 5),
                            y: Array.from({ length: 10 }, (_, i) => Math.sin(i * 0.5 + idx) * 2 + 2.5 + Math.random() * 0.5),
                            name: phase.name,
                            line: { width: 3, shape: 'spline' },
                            marker: { size: 8 }
                          })) as any}
                          layout={{
                            height: 400,
                            margin: { l: 60, r: 20, t: 20, b: 60 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                            xaxis: { title: 'Time (minutes)' },
                            yaxis: { title: 'Stage Intensity (0-5)' },
                            hovermode: 'x unified',
                            showlegend: true
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Time Series Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Time Series Data Points</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Time (min)', 'Orient', 'Clarify', 'Strategize', 'Execute', 'Monitor', 'Peak Stage'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45'],
                                ['3.2', '3.5', '3.1', '2.8', '2.5', '2.2', '1.9', '1.6', '1.3', '1.0'],
                                ['2.1', '2.5', '3.0', '3.2', '3.0', '2.8', '2.5', '2.2', '1.9', '1.6'],
                                ['1.5', '2.0', '2.8', '3.5', '4.0', '3.8', '3.5', '3.2', '2.9', '2.6'],
                                ['0.8', '1.2', '2.0', '3.0', '4.2', '4.5', '4.3', '4.0', '3.7', '3.4'],
                                ['0.5', '0.8', '1.2', '1.8', '2.5', '3.0', '3.2', '3.0', '2.8', '2.5'],
                                ['Orient', 'Orient', 'Clarify', 'Strategize', 'Execute', 'Execute', 'Execute', 'Execute', 'Monitor', 'Monitor']
                              ],
                              fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                              font: { size: 10, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], ['.1f'], ['.1f'], ['.1f'], []]
                            }
                          }] as any}
                          layout={{
                            height: 350,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Session Statistics */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-xs text-blue-600 font-medium">Total Duration</div>
                          <div className="text-lg font-bold text-blue-900">45 min</div>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="text-xs text-green-600 font-medium">Stage Transitions</div>
                          <div className="text-lg font-bold text-green-900">6</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <div className="text-xs text-purple-600 font-medium">Peak Intensity</div>
                          <div className="text-lg font-bold text-purple-900">4.5</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="text-xs text-amber-600 font-medium">Avg Intensity</div>
                          <div className="text-lg font-bold text-amber-900">2.8</div>
                        </div>
                      </div>

                      {/* Trajectory Analysis */}
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <Activity className="h-4 w-4 mr-2 text-indigo-600" />
                          Trajectory Analysis
                        </h4>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><strong>Pattern Detected:</strong> You spent most time in Execute stage (15-30 min), indicating strong implementation focus.</p>
                          <p><strong>Transition Speed:</strong> Quick transitions between Orient→Clarify→Strategize (0-15 min) show efficient problem setup.</p>
                          <p><strong>Observation:</strong> Monitor stage intensity increased gradually, suggesting growing self-awareness.</p>
                          <p><strong>Recommendation:</strong> Consider spending more time in Verify stage before moving to reflection.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Network Graph */}
                  {activeAnalysisSubPage === 'network' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Strategy Association Network</h4>
                        <Plot
                          data={[{
                            type: 'scatter',
                            mode: 'markers+text',
                            x: [1, 2, 3, 4, 5, 6, 7],
                            y: [1, 2, 1.5, 3, 2.5, 1, 2.8],
                            text: ['Question', 'Decompose', 'Monitor', 'Reason', 'Reflect', 'Verify', 'Plan'],
                            textposition: 'top center',
                            marker: { size: [30, 25, 20, 35, 28, 15, 32], color: ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6'] },
                            hovertemplate: '<b>%{text}</b><br>X: %{x}<br>Y: %{y}<extra></extra>'
                          }, {
                            type: 'scatter',
                            mode: 'lines',
                            x: [1, 2, 2, 3, 4, 5, 6, 7],
                            y: [1, 2, 1.5, 3, 2.5, 1, 2.8, 2.5],
                            line: { color: 'rgba(100, 100, 100, 0.3)', width: 2 },
                            showlegend: false,
                            hoverinfo: 'skip'
                          }] as any}
                          layout={{
                            height: 400,
                            margin: { l: 60, r: 20, t: 40, b: 60 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                            xaxis: { title: 'Strategy Dimension 1', showgrid: true },
                            yaxis: { title: 'Strategy Dimension 2', showgrid: true },
                            showlegend: false
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Strategy Network Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Strategy Network Metrics</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Strategy', 'Usage Count', 'Avg Duration', 'Connections', 'Centrality', 'Cluster'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                ['Question', 'Decompose', 'Monitor', 'Reason', 'Reflect', 'Verify', 'Plan'],
                                ['12', '8', '15', '10', '6', '4', '9'],
                                ['2.5 min', '3.2 min', '1.8 min', '2.1 min', '4.5 min', '1.2 min', '2.8 min'],
                                ['5', '4', '6', '5', '3', '2', '4'],
                                ['0.85', '0.72', '0.91', '0.78', '0.65', '0.45', '0.82'],
                                ['Core', 'Core', 'Hub', 'Core', 'Peripheral', 'Peripheral', 'Core']
                              ],
                              fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Network Insights */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Network Properties</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total Nodes:</span>
                              <span className="font-medium">7</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total Edges:</span>
                              <span className="font-medium">12</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Avg Degree:</span>
                              <span className="font-medium">3.4</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Density:</span>
                              <span className="font-medium">0.57</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Key Hubs</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Monitor (Hub):</span>
                              <span className="font-medium text-purple-600">6 connections</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Question (Core):</span>
                              <span className="font-medium text-blue-600">5 connections</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Reason (Core):</span>
                              <span className="font-medium text-green-600">5 connections</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Verify (Peripheral):</span>
                              <span className="font-medium text-gray-500">2 connections</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 3: Waterfall */}
                  {activeAnalysisSubPage === 'waterfall' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Cumulative Stage Progression (Waterfall)</h4>
                      <Plot
                        data={[{
                          type: 'waterfall',
                          orientation: 'v',
                          measure: ['relative', 'relative', 'relative', 'relative', 'relative', 'relative', 'total'],
                          x: phases.map(p => p.name),
                          textposition: 'outside',
                          text: ['+35', '+20', '+40', '+10', '+15', '+5', '125'],
                          y: [35, 20, 40, 10, 15, 5, 0],
                          connector: { line: { color: 'rgb(63, 63, 63)' } },
                          increasing: { marker: { color: '#10B981' } },
                          decreasing: { marker: { color: '#EF4444' } },
                          totals: { marker: { color: '#6366F1' } }
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 80 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Learning Stages' },
                          yaxis: { title: 'Cumulative Score' },
                          showlegend: false
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 4: Streamgraph */}
                  {activeAnalysisSubPage === 'streamgraph' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Strategy Usage Flow (Streamgraph)</h4>
                      <Plot
                        data={[
                          { name: 'Questioning', x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.3) * 5 + 10) },
                          { name: 'Decomposition', x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => Math.cos(i * 0.3) * 4 + 8) },
                          { name: 'Monitoring', x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.2) * 3 + 6) },
                          { name: 'Reasoning', x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => Math.cos(i * 0.4) * 5 + 7) },
                          { name: 'Reflection', x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.25) * 4 + 5) }
                        ].map((trace, idx) => ({
                          ...trace,
                          type: 'scatter',
                          mode: 'lines',
                          fill: 'tonexty',
                          stackgroup: 'one',
                          fillcolor: `rgba(${100 + idx * 40}, ${150 + idx * 30}, ${200 + idx * 20}, 0.6)`,
                          line: { color: `rgba(${100 + idx * 40}, ${150 + idx * 30}, ${200 + idx * 20}, 1)`, width: 2 }
                        })) as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Time Progression' },
                          yaxis: { title: 'Strategy Intensity' },
                          showlegend: true
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 5: Gantt-like Timeline */}
                  {activeAnalysisSubPage === 'gantt' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Learning Timeline (Gantt Chart)</h4>
                      <Plot
                        data={phases.map((phase, idx) => ({
                          type: 'bar',
                          x: [idx * 10 + 5],
                          y: [phase.name],
                          width: [8],
                          orientation: 'h',
                          marker: { color: ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6'][idx] },
                          text: [`${idx * 10}-${idx * 10 + 8} min`],
                          textposition: 'inside',
                          hovertemplate: '<b>%{y}</b><br>Duration: %{text}<extra></extra>'
                        })) as any}
                        layout={{
                          height: 300,
                          margin: { l: 120, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Time (minutes)' },
                          yaxis: { title: 'Learning Stages' },
                          showlegend: false
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 6: Bubble Chart */}
                  {activeAnalysisSubPage === 'bubble' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Strategy-Time-Intensity Bubble Chart</h4>
                      <Plot
                        data={[{
                          type: 'scatter',
                          mode: 'markers',
                          x: [15, 32, 65, 88, 130],
                          y: [3.5, 2.0, 4.0, 1.5, 3.8],
                          text: ['Questioning', 'Decomposition', 'Monitoring', 'Reasoning', 'Reflection'],
                          marker: {
                            size: [30, 25, 40, 20, 35],
                            color: [3.5, 2.0, 4.0, 1.5, 3.8],
                            colorscale: 'Viridis',
                            showscale: true,
                            colorbar: { title: 'Intensity' },
                            line: { color: 'rgba(0,0,0,0.3)', width: 2 }
                          },
                          hovertemplate: '<b>%{text}</b><br>Time: %{x}s<br>Score: %{y:.1f}<br>Size: Strategy Usage<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Time (seconds)' },
                          yaxis: { title: 'Strategy Score (0-5)' },
                          showlegend: false
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 7: Contour Map */}
                  {activeAnalysisSubPage === 'contour' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Strategy Density Contour Map</h4>
                      <Plot
                        data={[{
                          type: 'contour',
                          z: Array.from({ length: 20 }, (_, i) => 
                            Array.from({ length: 20 }, (_, j) => 
                              Math.sin(i * 0.3) * Math.cos(j * 0.3) * 3 + 3
                            )
                          ),
                          colorscale: 'Viridis',
                          contours: {
                            coloring: 'heatmap',
                            showlines: true
                          },
                          colorbar: { title: 'Strategy Density' },
                          hovertemplate: 'Strategy Density: %{z:.2f}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Time Dimension' },
                          yaxis: { title: 'Strategy Dimension' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* LEVEL 3 - Macro View */}
              {activeAnalysisLevel === 3 && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">⭐ LEVEL 3 — Macro View</h3>
                    <p className="text-sm text-gray-600">Long-term learner profile - Identity as a capable learner</p>
                  </div>

                  {/* Sub-page Navigation */}
                  <div className="flex space-x-2 mb-4 border-b border-gray-200 overflow-x-auto">
                    {[
                      { id: 'radar', name: 'Radar' },
                      { id: 'line', name: 'Line Chart' },
                      { id: 'stacked', name: 'Stacked Area' },
                      { id: 'scattermatrix', name: 'Scatter Matrix' },
                      { id: '3dsurface', name: '3D Surface' },
                      { id: 'heatmaptime', name: 'Heatmap TS' },
                      { id: 'radarcomp', name: 'Radar Compare' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAnalysisSubPage(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeAnalysisSubPage === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Chart 1: Radar */}
                  {activeAnalysisSubPage === 'radar' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Learning Profile Radar</h4>
                        <Plot
                          data={[
                            {
                              type: 'scatterpolar',
                              r: [4.2, 3.5, 4.8, 3.0, 2.5, 3.8, 4.0],
                              theta: ['Orient', 'Clarify', 'Strategize', 'Execute', 'Monitor', 'Verify', 'Reflect'],
                              fill: 'toself',
                              fillcolor: 'rgba(99, 102, 241, 0.2)',
                              line: { color: '#6366F1', width: 2 },
                              marker: { color: '#6366F1', size: 8 },
                              name: 'This Week'
                            },
                            {
                              type: 'scatterpolar',
                              r: [3.5, 3.0, 4.0, 3.5, 2.0, 2.5, 3.0],
                              theta: ['Orient', 'Clarify', 'Strategize', 'Execute', 'Monitor', 'Verify', 'Reflect'],
                              fill: 'toself',
                              fillcolor: 'rgba(16, 185, 129, 0.15)',
                              line: { color: '#10B981', width: 2 },
                              marker: { color: '#10B981', size: 8 },
                              name: 'Last Week'
                            }
                          ] as any}
                          layout={{
                            polar: {
                              bgcolor: 'rgba(255,255,255,0.0)',
                              radialaxis: { 
                                gridcolor: '#E5E7EB', 
                                linecolor: '#E5E7EB', 
                                tickfont: { size: 9 },
                                range: [0, 5],
                                tickmode: 'linear',
                                tick0: 0,
                                dtick: 1
                              },
                              angularaxis: { 
                                gridcolor: '#E5E7EB', 
                                linecolor: '#E5E7EB', 
                                tickfont: { size: 9 }
                              }
                            },
                            height: 400,
                            margin: { l: 20, r: 20, t: 40, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                            showlegend: true,
                            legend: { x: 0.5, y: -0.1, xanchor: 'center', orientation: 'h' }
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Radar Comparison Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Weekly Comparison Data</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Stage', 'This Week', 'Last Week', 'Change', 'Trend', 'Status'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                phases.map(p => p.name),
                                [4.2, 3.5, 4.8, 3.0, 2.5, 3.8, 4.0],
                                [3.5, 3.0, 4.0, 3.5, 2.0, 2.5, 3.0],
                                ['+0.7', '+0.5', '+0.8', '-0.5', '+0.5', '+1.3', '+1.0'],
                                ['↑', '↑', '↑', '↓', '↑', '↑', '↑'],
                                ['Improved', 'Improved', 'Improved', 'Declined', 'Improved', 'Improved', 'Improved']
                              ],
                              fill: { 
                                color: [
                                  ['white', 'white', 'white', 'white', 'white', 'white', 'white'],
                                  ['#F0F9FF', '#F0F9FF', '#F0F9FF', '#FEF2F2', '#F0F9FF', '#F0F9FF', '#F0F9FF']
                                ]
                              },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], [], [], []]
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Performance Metrics */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                          <div className="text-xs text-blue-600 font-medium mb-1">Overall Score</div>
                          <div className="text-2xl font-bold text-blue-900">3.7</div>
                          <div className="text-xs text-blue-700 mt-1">↑ +0.6 from last week</div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                          <div className="text-xs text-green-600 font-medium mb-1">Strongest Area</div>
                          <div className="text-lg font-bold text-green-900">Strategize</div>
                          <div className="text-xs text-green-700 mt-1">Score: 4.8/5.0</div>
                        </div>
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
                          <div className="text-xs text-amber-600 font-medium mb-1">Needs Focus</div>
                          <div className="text-lg font-bold text-amber-900">Monitor</div>
                          <div className="text-xs text-amber-700 mt-1">Score: 2.5/5.0</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                          <div className="text-xs text-purple-600 font-medium mb-1">Improvement Rate</div>
                          <div className="text-2xl font-bold text-purple-900">+16%</div>
                          <div className="text-xs text-purple-700 mt-1">Week over week</div>
                        </div>
                      </div>

                      {/* Growth Analysis */}
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2 text-indigo-600" />
                          Growth Analysis
                        </h4>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><strong>Major Improvement:</strong> Verify stage improved by +1.3 (from 2.5 to 3.8), showing significant growth in verification skills.</p>
                          <p><strong>Consistent Strength:</strong> Strategize stage remains your strongest area (4.8), indicating excellent planning abilities.</p>
                          <p><strong>Area of Concern:</strong> Execute stage declined slightly (-0.5), may need attention to maintain implementation quality.</p>
                          <p><strong>Overall Trend:</strong> Positive growth trajectory with 6 out of 7 stages showing improvement this week.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Line Chart */}
                  {activeAnalysisSubPage === 'line' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Growth Trend Over Time</h4>
                        <Plot
                          data={[
                            { name: 'Knowledge', x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], y: [2.5, 3.0, 3.5, 4.0], type: 'scatter', mode: 'lines+markers', line: { width: 3 } },
                            { name: 'Skill', x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], y: [2.0, 2.8, 3.2, 3.8], type: 'scatter', mode: 'lines+markers', line: { width: 3 } },
                            { name: 'Attitude', x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], y: [3.0, 3.2, 3.5, 3.9], type: 'scatter', mode: 'lines+markers', line: { width: 3 } },
                            { name: 'Meta-Cognition', x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], y: [1.5, 2.2, 2.8, 3.5], type: 'scatter', mode: 'lines+markers', line: { width: 3 } }
                          ] as any}
                          layout={{
                            height: 400,
                            margin: { l: 60, r: 20, t: 20, b: 60 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                            xaxis: { title: 'Time Period' },
                            yaxis: { title: 'Score (0-5)', range: [0, 5] },
                            hovermode: 'x unified',
                            showlegend: true
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Growth Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Weekly Growth Data</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Week', 'Knowledge', 'Skill', 'Attitude', 'Meta-Cog', 'Total', 'Growth Rate'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                                [2.5, 3.0, 3.5, 4.0],
                                [2.0, 2.8, 3.2, 3.8],
                                [3.0, 3.2, 3.5, 3.9],
                                [1.5, 2.2, 2.8, 3.5],
                                [9.0, 11.2, 13.0, 15.2],
                                ['-', '+24%', '+16%', '+17%']
                              ],
                              fill: { 
                                color: [
                                  ['white', 'white', 'white', 'white'],
                                  ['#F0F9FF', '#DBEAFE', '#BFDBFE', '#93C5FD']
                                ]
                              },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.1f'], ['.1f'], ['.1f'], ['.1f'], ['.1f'], []]
                            }
                          }] as any}
                          layout={{
                            height: 250,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Growth Metrics */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-xs text-blue-600 font-medium">Knowledge Growth</div>
                          <div className="text-lg font-bold text-blue-900">+60%</div>
                          <div className="text-xs text-blue-700">2.5 → 4.0</div>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="text-xs text-green-600 font-medium">Skill Growth</div>
                          <div className="text-lg font-bold text-green-900">+90%</div>
                          <div className="text-xs text-green-700">2.0 → 3.8</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <div className="text-xs text-purple-600 font-medium">Meta-Cog Growth</div>
                          <div className="text-lg font-bold text-purple-900">+133%</div>
                          <div className="text-xs text-purple-700">1.5 → 3.5</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="text-xs text-amber-600 font-medium">Avg Growth</div>
                          <div className="text-lg font-bold text-amber-900">+69%</div>
                          <div className="text-xs text-amber-700">Overall</div>
                        </div>
                      </div>

                      {/* Trend Analysis */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                          Trend Analysis
                        </h4>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><strong>Fastest Growth:</strong> Meta-Cognition shows +133% growth, indicating strong development in self-regulation skills.</p>
                          <p><strong>Steady Progress:</strong> All dimensions show consistent upward trends with no regression periods.</p>
                          <p><strong>Acceleration:</strong> Growth rate increased in Week 3-4, suggesting learning momentum.</p>
                          <p><strong>Projection:</strong> If current trend continues, all dimensions will reach 4.0+ by Week 6.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 3: Stacked Area */}
                  {activeAnalysisSubPage === 'stacked' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Ability Development Stacked Area</h4>
                      <Plot
                        data={[
                          { name: 'Knowledge', x: Array.from({ length: 12 }, (_, i) => `M${i+1}`), y: Array.from({ length: 12 }, () => Math.random() * 2 + 2), type: 'scatter', mode: 'lines', fill: 'tozeroy', stackgroup: 'one' },
                          { name: 'Skill', x: Array.from({ length: 12 }, (_, i) => `M${i+1}`), y: Array.from({ length: 12 }, () => Math.random() * 2 + 1.5), type: 'scatter', mode: 'lines', fill: 'tonexty', stackgroup: 'one' },
                          { name: 'Attitude', x: Array.from({ length: 12 }, (_, i) => `M${i+1}`), y: Array.from({ length: 12 }, () => Math.random() * 1.5 + 1), type: 'scatter', mode: 'lines', fill: 'tonexty', stackgroup: 'one' },
                          { name: 'Meta-Cognition', x: Array.from({ length: 12 }, (_, i) => `M${i+1}`), y: Array.from({ length: 12 }, () => Math.random() * 1 + 0.5), type: 'scatter', mode: 'lines', fill: 'tonexty', stackgroup: 'one' }
                        ] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Month' },
                          yaxis: { title: 'Cumulative Score' },
                          showlegend: true
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 4: Scatter Matrix */}
                  {activeAnalysisSubPage === 'scattermatrix' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Multi-Dimensional Correlation Matrix</h4>
                      <Plot
                        data={[{
                          type: 'splom',
                          dimensions: [
                            { label: 'Knowledge', values: Array.from({ length: 50 }, () => Math.random() * 5) },
                            { label: 'Skill', values: Array.from({ length: 50 }, () => Math.random() * 5) },
                            { label: 'Attitude', values: Array.from({ length: 50 }, () => Math.random() * 5) },
                            { label: 'Meta-Cog', values: Array.from({ length: 50 }, () => Math.random() * 5) }
                          ],
                          marker: {
                            size: 7,
                            color: Array.from({ length: 50 }, () => Math.random() * 5),
                            colorscale: 'Viridis',
                            showscale: true,
                            line: { width: 1, color: 'white' }
                          },
                          diagonal: { visible: false },
                          showupperhalf: true,
                          showlowerhalf: true
                        }] as any}
                        layout={{
                          height: 500,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 5: 3D Surface */}
                  {activeAnalysisSubPage === '3dsurface' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Ability Landscape (3D Surface)</h4>
                      <Plot
                        data={[{
                          type: 'surface',
                          z: Array.from({ length: 20 }, (_, i) => 
                            Array.from({ length: 20 }, (_, j) => 
                              Math.sin(i * 0.3) * Math.cos(j * 0.3) * 2 + 3
                            )
                          ),
                          colorscale: 'Viridis',
                          showscale: true,
                          colorbar: { title: 'Ability Level' },
                          hovertemplate: 'Knowledge: %{x}<br>Skill: %{y}<br>Ability: %{z:.2f}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 500,
                          margin: { l: 0, r: 0, t: 20, b: 0 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          scene: {
                            xaxis: { title: 'Knowledge Dimension' },
                            yaxis: { title: 'Skill Dimension' },
                            zaxis: { title: 'Overall Ability' },
                            bgcolor: 'rgba(0,0,0,0)',
                            camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } }
                          },
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 6: Heatmap Time Series */}
                  {activeAnalysisSubPage === 'heatmaptime' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Long-term Pattern Heatmap</h4>
                      <Plot
                        data={[{
                          type: 'heatmap',
                          z: Array.from({ length: 7 }, (_, i) => 
                            Array.from({ length: 12 }, (_, j) => 
                              Math.sin(i * 0.5 + j * 0.3) * 2 + 3 + Math.random() * 0.5
                            )
                          ),
                          x: Array.from({ length: 12 }, (_, i) => `Week ${i+1}`),
                          y: phases.map(p => p.name),
                          colorscale: 'RdYlGn',
                          showscale: true,
                          colorbar: { title: 'Score' },
                          hovertemplate: '<b>%{y}</b><br>%{x}<br>Score: %{z:.2f}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 100, r: 20, t: 20, b: 80 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { tickangle: -45 }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 7: Radar Comparison */}
                  {activeAnalysisSubPage === 'radarcomp' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Multi-Period Radar Comparison</h4>
                      <Plot
                        data={[
                          {
                            type: 'scatterpolar',
                            r: [4.2, 3.5, 4.8, 3.0, 2.5, 3.8, 4.0],
                            theta: phases.map(p => p.name),
                            fill: 'toself',
                            fillcolor: 'rgba(99, 102, 241, 0.2)',
                            line: { color: '#6366F1', width: 2 },
                            name: 'This Week'
                          },
                          {
                            type: 'scatterpolar',
                            r: [3.5, 3.0, 4.0, 3.5, 2.0, 2.5, 3.0],
                            theta: phases.map(p => p.name),
                            fill: 'toself',
                            fillcolor: 'rgba(16, 185, 129, 0.15)',
                            line: { color: '#10B981', width: 2 },
                            name: 'Last Week'
                          },
                          {
                            type: 'scatterpolar',
                            r: [2.8, 2.5, 3.5, 3.0, 1.5, 2.0, 2.5],
                            theta: phases.map(p => p.name),
                            fill: 'toself',
                            fillcolor: 'rgba(245, 158, 11, 0.15)',
                            line: { color: '#F59E0B', width: 2 },
                            name: 'Two Weeks Ago'
                          }
                        ] as any}
                        layout={{
                          polar: {
                            bgcolor: 'rgba(255,255,255,0.0)',
                            radialaxis: { 
                              gridcolor: '#E5E7EB', 
                              linecolor: '#E5E7EB', 
                              tickfont: { size: 9 },
                              range: [0, 5]
                            },
                            angularaxis: { 
                              gridcolor: '#E5E7EB', 
                              linecolor: '#E5E7EB', 
                              tickfont: { size: 9 }
                            }
                          },
                          height: 500,
                          margin: { l: 20, r: 20, t: 40, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          showlegend: true,
                          legend: { x: 0.5, y: -0.1, xanchor: 'center', orientation: 'h' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* LEVEL 4 - Identity & Metacognition Feedback */}
              {activeAnalysisLevel === 4 && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">⭐ LEVEL 4 — Identity & Metacognition Feedback</h3>
                    <p className="text-sm text-gray-600">Learning identity formation - You are becoming a capable learner</p>
                  </div>

                  {/* Sub-page Navigation */}
                  <div className="flex space-x-2 mb-4 border-b border-gray-200 overflow-x-auto">
                    {[
                      { id: 'identity', name: 'Identity' },
                      { id: 'pie', name: 'Pie Chart' },
                      { id: 'funnel', name: 'Funnel' },
                      { id: 'sunburst', name: 'Sunburst' },
                      { id: 'icicle', name: 'Icicle' },
                      { id: 'barpolar', name: 'Polar Bar' },
                      { id: 'candlestick', name: 'Candlestick' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAnalysisSubPage(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeAnalysisSubPage === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Chart 1: Identity Feedback */}
                  {activeAnalysisSubPage === 'identity' && (
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-6 shadow-md">
                      <div className="flex items-start space-x-3">
                        <Brain className="h-6 w-6 text-purple-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-gray-900 mb-2">AI Learning Identity Feedback</h4>
                          <p className="text-gray-800 leading-relaxed">
                            🧠 <strong>You are developing more self-monitoring behaviors</strong> — 
                            You notice uncertainty more often now. Keep refining your verification skills.
                          </p>
                          <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200">
                            <p className="text-sm text-gray-700">
                              ⭐ <strong>You shifted from action-oriented to reflective learning this week</strong> — 
                              This indicates metacognitive identity formation. You're not just completing tasks, 
                              you're learning how to learn.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Pie Chart */}
                  {activeAnalysisSubPage === 'pie' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Identity Feature Distribution</h4>
                        <Plot
                          data={[{
                            type: 'pie',
                            labels: ['Self-Monitor', 'Reflective', 'Strategic', 'Action-Oriented', 'Collaborative'],
                            values: [35, 25, 20, 15, 5],
                            hole: 0.4,
                            marker: {
                              colors: ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F59E0B'],
                              line: { color: 'white', width: 2 }
                            },
                            textinfo: 'label+percent',
                            hovertemplate: '<b>%{label}</b><br>Percentage: %{percent}<br>Value: %{value}<extra></extra>'
                          }] as any}
                          layout={{
                            height: 400,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 12, family: 'Inter, system-ui, sans-serif' },
                            showlegend: true
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Identity Distribution Data Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Identity Feature Breakdown</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Identity Feature', 'Percentage', 'Count', 'Growth', 'Trend', 'Description'],
                              fill: { color: '#8B5CF6' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                ['Self-Monitor', 'Reflective', 'Strategic', 'Action-Oriented', 'Collaborative'],
                                ['35%', '25%', '20%', '15%', '5%'],
                                ['35', '25', '20', '15', '5'],
                                ['+5%', '+3%', '+2%', '-2%', '+1%'],
                                ['↑', '↑', '↑', '↓', '↑'],
                                ['Strong self-awareness', 'Deep thinking', 'Planning focus', 'Quick action', 'Team work']
                              ],
                              fill: { color: [['white', 'white', 'white', 'white', 'white']] },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Identity Metrics */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                          <div className="text-xs text-purple-600 font-medium mb-1">Dominant Identity</div>
                          <div className="text-lg font-bold text-purple-900">Self-Monitor</div>
                          <div className="text-xs text-purple-700 mt-1">35% of behaviors</div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-4">
                          <div className="text-xs text-indigo-600 font-medium mb-1">Identity Diversity</div>
                          <div className="text-lg font-bold text-indigo-900">High</div>
                          <div className="text-xs text-indigo-700 mt-1">5 active features</div>
                        </div>
                        <div className="bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 rounded-lg p-4">
                          <div className="text-xs text-pink-600 font-medium mb-1">Formation Stage</div>
                          <div className="text-lg font-bold text-pink-900">Advanced</div>
                          <div className="text-xs text-pink-700 mt-1">Well-developed</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 3: Funnel */}
                  {activeAnalysisSubPage === 'funnel' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Identity Formation Process (Funnel)</h4>
                      <Plot
                        data={[{
                          type: 'funnel',
                          y: ['Awareness', 'Understanding', 'Application', 'Integration', 'Identity'],
                          x: [100, 75, 50, 30, 15],
                          textposition: 'inside',
                          text: ['100%', '75%', '50%', '30%', '15%'],
                          marker: {
                            color: ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F59E0B'],
                            line: { color: 'white', width: 2 }
                          },
                          hovertemplate: '<b>%{y}</b><br>Progress: %{x}%<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 100, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 4: Sunburst */}
                  {activeAnalysisSubPage === 'sunburst' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Identity Hierarchy (Sunburst)</h4>
                      <Plot
                        data={[{
                          type: 'sunburst',
                          labels: ['Learner', 'Self-Monitor', 'Reflective', 'Strategic', 'Action-Oriented', 'Collaborative', 'Meta-Learner', 'Problem-Solver'],
                          parents: ['', 'Learner', 'Learner', 'Learner', 'Learner', 'Learner', 'Self-Monitor', 'Strategic'],
                          values: [100, 35, 25, 20, 15, 5, 20, 15],
                          branchvalues: 'total',
                          marker: {
                            colors: ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#14B8A6']
                          },
                          hovertemplate: '<b>%{label}</b><br>Value: %{value}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 500,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 5: Icicle */}
                  {activeAnalysisSubPage === 'icicle' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Identity Structure (Icicle)</h4>
                      <Plot
                        data={[{
                          type: 'icicle',
                          labels: ['Learner', 'Self-Monitor', 'Reflective', 'Strategic', 'Action-Oriented', 'Collaborative'],
                          parents: ['', 'Learner', 'Learner', 'Learner', 'Learner', 'Learner'],
                          values: [100, 35, 25, 20, 15, 5],
                          branchvalues: 'total',
                          marker: {
                            colors: ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F59E0B', '#10B981'],
                            line: { color: 'white', width: 2 }
                          },
                          hovertemplate: '<b>%{label}</b><br>Value: %{value}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 6: Polar Bar */}
                  {activeAnalysisSubPage === 'barpolar' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Identity Dimensions (Polar Bar)</h4>
                      <Plot
                        data={[{
                          type: 'barpolar',
                          r: [35, 25, 20, 15, 5, 30, 40],
                          theta: ['Self-Monitor', 'Reflective', 'Strategic', 'Action', 'Collaborative', 'Meta-Learner', 'Problem-Solver'],
                          marker: {
                            color: [35, 25, 20, 15, 5, 30, 40],
                            colorscale: 'Viridis',
                            showscale: true,
                            line: { color: 'white', width: 2 }
                          },
                          hovertemplate: '<b>%{theta}</b><br>Score: %{r}<extra></extra>'
                        }] as any}
                        layout={{
                          polar: {
                            bgcolor: 'rgba(255,255,255,0.0)',
                            radialaxis: { 
                              gridcolor: '#E5E7EB', 
                              linecolor: '#E5E7EB', 
                              tickfont: { size: 9 },
                              range: [0, 50]
                            },
                            angularaxis: { 
                              gridcolor: '#E5E7EB', 
                              linecolor: '#E5E7EB', 
                              tickfont: { size: 9 }
                            }
                          },
                          height: 500,
                          margin: { l: 20, r: 20, t: 40, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 7: Candlestick */}
                  {activeAnalysisSubPage === 'candlestick' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Identity Development Range (Candlestick)</h4>
                      <Plot
                        data={[{
                          type: 'candlestick',
                          x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                          open: [2.0, 2.5, 3.0, 3.5],
                          high: [3.5, 4.0, 4.5, 4.8],
                          low: [1.5, 2.0, 2.5, 3.0],
                          close: [3.0, 3.5, 4.0, 4.5],
                          increasing: { line: { color: '#10B981' }, fillcolor: '#10B981' },
                          decreasing: { line: { color: '#EF4444' }, fillcolor: '#EF4444' },
                          hovertemplate: '<b>%{x}</b><br>Open: %{open}<br>High: %{high}<br>Low: %{low}<br>Close: %{close}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Time Period' },
                          yaxis: { title: 'Identity Score (0-5)' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* LEVEL 5 - Next Step Recommendations */}
              {activeAnalysisLevel === 5 && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">⭐ LEVEL 5 — Next Step Recommendations</h3>
                    <p className="text-sm text-gray-600">Personalized action suggestions - Scaffolding for growth</p>
                  </div>

                  {/* Sub-page Navigation */}
                  <div className="flex space-x-2 mb-4 border-b border-gray-200 overflow-x-auto">
                    {[
                      { id: 'recommendations', name: 'Recommendations' },
                      { id: 'gauge', name: 'Gauge' },
                      { id: 'indicator', name: 'Indicator' },
                      { id: 'bar3d', name: '3D Bar' },
                      { id: 'histogram', name: 'Histogram' },
                      { id: 'density', name: 'Density' },
                      { id: 'table', name: 'Data Table' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAnalysisSubPage(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeAnalysisSubPage === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Chart 1: Recommendations */}
                  {activeAnalysisSubPage === 'recommendations' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <Target className="h-5 w-5 text-indigo-600" />
                          <h4 className="font-semibold text-gray-900">Task Suggestions</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          Next time, try writing out your verification logic before giving the final answer. 
                          This will strengthen your justification skills.
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <Network className="h-5 w-5 text-purple-600" />
                          <h4 className="font-semibold text-gray-900">Strategy Suggestions</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          You skipped the planning stage. Consider drawing out steps or writing a pseudo-plan 
                          before execution to improve your strategic thinking.
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <TrendingUp className="h-5 w-5 text-amber-600" />
                          <h4 className="font-semibold text-gray-900">This Week's Learning Goal</h4>
                        </div>
                        <p className="text-sm text-gray-800 font-medium mb-2">
                          Focus: Improve verification statement ability
                        </p>
                        <p className="text-sm text-gray-700">
                          Recommended task: Try explaining why your solution works, not just that it works.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Gauge */}
                  {activeAnalysisSubPage === 'gauge' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Learning Progress Gauge</h4>
                        <Plot
                          data={[{
                            type: 'indicator',
                            mode: 'gauge+number+delta',
                            value: 75,
                            delta: { reference: 60 },
                            domain: { x: [0, 1], y: [0, 1] },
                            title: { text: 'Overall Progress' },
                            gauge: {
                              axis: { range: [null, 100] },
                              bar: { color: '#6366F1' },
                              steps: [
                                { range: [0, 50], color: '#E5E7EB' },
                                { range: [50, 80], color: '#DBEAFE' },
                                { range: [80, 100], color: '#BFDBFE' }
                              ],
                              threshold: {
                                line: { color: 'red', width: 4 },
                                thickness: 0.75,
                                value: 90
                              }
                            }
                          }] as any}
                          layout={{
                            height: 300,
                            margin: { l: 20, r: 20, t: 40, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            font: { size: 14, family: 'Inter, system-ui, sans-serif' }
                          }}
                          config={{ displayModeBar: true, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Progress Breakdown Table */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h4 className="font-semibold text-gray-900 mb-4">Progress Breakdown by Category</h4>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Category', 'Current', 'Target', 'Progress', 'Status', 'Priority'],
                              fill: { color: '#6366F1' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                ['Knowledge', 'Skill', 'Attitude', 'Meta-Cognition', 'Overall'],
                                ['78%', '72%', '85%', '65%', '75%'],
                                ['80%', '75%', '80%', '70%', '76%'],
                                ['97.5%', '96%', '106%', '93%', '98.7%'],
                                ['On Track', 'On Track', 'Exceeded', 'Below Target', 'On Track'],
                                ['Medium', 'High', 'Low', 'High', 'Medium']
                              ],
                              fill: { 
                                color: [
                                  ['white', 'white', 'white', 'white', 'white'],
                                  ['#F0F9FF', '#F0F9FF', '#D1FAE5', '#FEF2F2', '#F0F9FF']
                                ]
                              },
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                              align: 'left',
                              format: [[], ['.0f'], ['.0f'], ['.1f'], [], []]
                            }
                          }] as any}
                          layout={{
                            height: 250,
                            margin: { l: 20, r: 20, t: 20, b: 20 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>

                      {/* Recommendation Priority Matrix */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">High Priority Actions</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                              <span className="text-gray-700">Meta-Cognition</span>
                              <span className="font-bold text-red-600">65% → 70%</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-amber-50 rounded">
                              <span className="text-gray-700">Skill Development</span>
                              <span className="font-bold text-amber-600">72% → 75%</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h5 className="font-semibold text-sm text-gray-700 mb-3">Next Milestones</h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                              <span className="text-gray-700">80% Overall</span>
                              <span className="font-bold text-blue-600">5% to go</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                              <span className="text-gray-700">Attitude</span>
                              <span className="font-bold text-green-600">✓ Exceeded</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart 3: Indicator */}
                  {activeAnalysisSubPage === 'indicator' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Multi-Dimensional Progress Indicators</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {['Knowledge', 'Skill', 'Attitude', 'Meta-Cognition'].map((dim, idx) => (
                          <Plot
                            key={dim}
                            data={[{
                              type: 'indicator',
                              mode: 'gauge+number',
                              value: [75, 68, 82, 65][idx],
                              domain: { x: [0, 1], y: [0, 1] },
                              title: { text: dim },
                              gauge: {
                                axis: { range: [null, 100] },
                                bar: { color: ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899'][idx] },
                                steps: [
                                  { range: [0, 50], color: '#E5E7EB' },
                                  { range: [50, 100], color: '#DBEAFE' }
                                ]
                              }
                            }] as any}
                            layout={{
                              height: 200,
                              margin: { l: 20, r: 20, t: 40, b: 20 },
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', height: '100%' }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chart 4: 3D Bar */}
                  {activeAnalysisSubPage === 'bar3d' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Recommendation Priority (3D Bar)</h4>
                      <Plot
                        data={[{
                          type: 'bar3d',
                          x: [1, 2, 3, 4, 5],
                          y: [1, 1, 1, 1, 1],
                          z: [8, 7, 6, 5, 4],
                          text: ['Verification', 'Planning', 'Monitoring', 'Reflection', 'Strategy'],
                          marker: {
                            color: [8, 7, 6, 5, 4],
                            colorscale: 'Viridis',
                            showscale: true,
                            colorbar: { title: 'Priority' }
                          },
                          hovertemplate: '<b>%{text}</b><br>Priority: %{z}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 500,
                          margin: { l: 0, r: 0, t: 20, b: 0 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          scene: {
                            xaxis: { title: 'Recommendation Type' },
                            yaxis: { title: 'Category' },
                            zaxis: { title: 'Priority (1-10)' },
                            bgcolor: 'rgba(0,0,0,0)',
                            camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } }
                          },
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 5: Histogram */}
                  {activeAnalysisSubPage === 'histogram' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Recommendation Distribution (Histogram)</h4>
                      <Plot
                        data={[{
                          type: 'histogram',
                          x: Array.from({ length: 100 }, () => Math.random() * 10),
                          nbinsx: 20,
                          marker: {
                            color: '#6366F1',
                            line: { color: 'white', width: 1 }
                          },
                          hovertemplate: 'Count: %{y}<br>Range: %{x}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Recommendation Score' },
                          yaxis: { title: 'Frequency' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 6: Density */}
                  {activeAnalysisSubPage === 'density' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Recommendation Density Map</h4>
                      <Plot
                        data={[{
                          type: 'histogram2dcontour',
                          x: Array.from({ length: 200 }, () => Math.random() * 10),
                          y: Array.from({ length: 200 }, () => Math.random() * 10),
                          colorscale: 'Viridis',
                          showscale: true,
                          colorbar: { title: 'Density' },
                          hovertemplate: 'X: %{x:.2f}<br>Y: %{y:.2f}<br>Density: %{z:.2f}<extra></extra>'
                        }] as any}
                        layout={{
                          height: 400,
                          margin: { l: 60, r: 20, t: 20, b: 60 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                          xaxis: { title: 'Task Complexity' },
                          yaxis: { title: 'Skill Level' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  {/* Chart 7: Data Table */}
                  {activeAnalysisSubPage === 'table' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-4">Recommendation Data Table</h4>
                      <Plot
                        data={[{
                          type: 'table',
                          header: {
                            values: ['Recommendation', 'Priority', 'Category', 'Status', 'Progress'],
                            fill: { color: '#6366F1' },
                            font: { size: 12, color: 'white' },
                            align: 'left'
                          },
                          cells: {
                            values: [
                              ['Improve Verification', 'Enhance Planning', 'Strengthen Monitoring', 'Deepen Reflection', 'Develop Strategy'],
                              [8, 7, 6, 5, 4],
                              ['Task', 'Strategy', 'Meta-Cog', 'Meta-Cog', 'Strategy'],
                              ['Active', 'Pending', 'Active', 'Completed', 'Pending'],
                              [75, 50, 30, 100, 25]
                            ],
                            fill: { color: [['#F0F9FF', '#E0F2FE', '#F0F9FF', '#D1FAE5', '#E0F2FE']] },
                            font: { size: 11 },
                            align: 'left',
                            format: [[], [], [], [], [null, null, null, null, '%']]
                          }
                        }] as any}
                        layout={{
                          height: 300,
                          margin: { l: 20, r: 20, t: 20, b: 20 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          font: { size: 11, family: 'Inter, system-ui, sans-serif' }
                        }}
                        config={{ displayModeBar: true, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calculation Steps Modal */}
      {showCalculationSteps && calculationSteps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-5xl h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 text-slate-900 rounded-t-xl">
              <div>
                <h2 className="text-base font-bold flex items-center space-x-2">
                  <Calculator className="h-5 w-5" />
                  <span>Stage Score Calculation Steps</span>
                </h2>
                <p className="text-xs text-indigo-100 mt-1">Multi-stage scoring algorithm breakdown</p>
              </div>
              <button
                onClick={() => setShowCalculationSteps(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Original Prompt */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Original Prompt
                </h3>
                <p className="text-sm text-gray-700">{calculationSteps.prompt}</p>
              </div>

              {/* Step 1: Segmentation */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-2">1</span>
                  Step 1: Text Segmentation (Utterance Segmentation)
                </h3>
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-semibold text-blue-900 mb-1">Formula:</p>
                  <div className="text-sm text-blue-800 my-2">
                    {renderMathFormula('\\text{Segments} = \\text{split}(\\text{prompt}, \\text{delimiters})', true)}
                  </div>
                  <p className="text-xs text-blue-700 mt-2">Where delimiters = {`['.', '!', '?', '。', '！', '？', '\\n']`} and each segment represents a micro-learning act or utterance</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">Split prompt into micro-learning acts</p>
                <div className="mb-3 p-2 bg-gray-100 rounded text-xs">
                  <strong>Total Segments:</strong> {calculationSteps.step1_segmentation.length} | 
                  <strong> Original Prompt Length:</strong> {calculationSteps.prompt.length} characters
                </div>
                <div className="space-y-2">
                  {calculationSteps.step1_segmentation.map((seg, idx) => {
                    const segmentText = typeof seg === 'string' ? seg : seg.segment;
                    const startPos = typeof seg === 'object' && 'start' in seg ? seg.start : idx * 50;
                    const endPos = typeof seg === 'object' && 'end' in seg ? seg.end : (idx + 1) * 50;
                    return (
                      <div key={idx} className="flex items-start space-x-2 p-2 bg-gray-50 rounded-lg">
                        <span className="text-xs font-bold text-indigo-600 w-6">{idx + 1}</span>
                        <div className="flex-1">
                          <span className="text-sm text-gray-700">{segmentText}</span>
                          <div className="text-xs text-gray-500 mt-1">
                            Length: {segmentText.length} chars | 
                            Position: {startPos}-{endPos}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Sentiment Analysis */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-2">2</span>
                  Step 2: Sentiment & Emotion Analysis
                </h3>
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs font-semibold text-purple-900 mb-1">Formula:</p>
                  <div className="text-sm text-purple-800 my-2">
                    {renderMathFormula('\\text{Sentiment} = \\text{LLM}(\\text{prompt}) \\rightarrow \\{\\text{sentiment}, \\text{confusion}, \\text{frustration}, \\text{engagement}\\}', true)}
                  </div>
                  <p className="text-xs text-purple-700">Where each score is normalized to {renderMathFormula('[0, 1]')} or {renderMathFormula('[-1, 1]')} range</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">Analyze emotional state and learning attitude</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">Sentiment</div>
                    <div className="text-lg font-bold text-blue-900">{calculationSteps.step2_sentiment.sentiment.toFixed(2)}</div>
                    <div className="text-xs text-blue-700">Range: -1 to +1</div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3">
                    <div className="text-xs text-amber-600 font-medium mb-1">Confusion</div>
                    <div className="text-lg font-bold text-amber-900">{calculationSteps.step2_sentiment.confusion_score.toFixed(2)}</div>
                    <div className="text-xs text-amber-700">0 to 1</div>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-3">
                    <div className="text-xs text-red-600 font-medium mb-1">Frustration</div>
                    <div className="text-lg font-bold text-red-900">{calculationSteps.step2_sentiment.frustration_score.toFixed(2)}</div>
                    <div className="text-xs text-red-700">0 to 1</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium mb-1">Engagement</div>
                    <div className="text-lg font-bold text-green-900">{calculationSteps.step2_sentiment.engagement_score.toFixed(2)}</div>
                    <div className="text-xs text-green-700">0 to 1</div>
                  </div>
                </div>
              </div>

              {/* Step 3: Stage Tagging */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-indigo-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-2">3</span>
                  Step 3: Stage Multi-Label Tagger
                </h3>
                <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs font-semibold text-indigo-900 mb-1">Formula:</p>
                  <p className="text-xs text-indigo-800 font-mono mb-2">For each segment i: P(stage_k | segment_i) = LLM_Tagger(segment_i)</p>
                  <p className="text-xs text-indigo-700">Where P ∈ [0, 1] is probability and intensity ∈ [0, 1] is strength</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">Assign stage probabilities and intensities to each segment</p>
                <div className="space-y-3">
                  {calculationSteps.step3_stageTagging.map((tag, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-sm text-gray-900 mb-2">Segment {idx + 1}: "{tag.segment}"</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        {phases.map((phase) => {
                          const stageData = tag.stages[phase.id as keyof typeof tag.stages];
                          return stageData ? (
                            <div key={phase.id} className="bg-gray-50 rounded p-2">
                              <div className="text-xs font-medium text-gray-700">{phase.name}</div>
                              <div className="text-xs text-gray-600">P: {stageData.p.toFixed(2)}</div>
                              <div className="text-xs text-gray-600">I: {stageData.intensity.toFixed(2)}</div>
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div className="flex items-center space-x-4 text-xs">
                        <span className="text-gray-600">Cognitive: <strong>{tag.cognitive_vs_metacognitive.cognitive.toFixed(2)}</strong></span>
                        <span className="text-gray-600">Meta-Cognitive: <strong>{tag.cognitive_vs_metacognitive.metacognitive.toFixed(2)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 4: Aggregation */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-2">4</span>
                  Step 4: Aggregation (Sub-segment → Prompt Level)
                </h3>
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-900 mb-1">Formula:</p>
                  <div className="text-sm text-green-800 my-2">
                    {renderMathFormula('S_k = \\sum_{i} (w_i \\times p_{i,k} \\times q_{i,k})', true)}
                  </div>
                  <p className="text-xs text-green-700 mb-2">Where:</p>
                  <ul className="text-xs text-green-700 list-disc list-inside ml-2 space-y-1">
                    <li>{renderMathFormula('S_k')} = raw score for stage {renderMathFormula('k')}</li>
                    <li>{renderMathFormula('w_i = \\frac{\\text{length}_i}{\\text{total\\_length}}')}</li>
                    <li>{renderMathFormula('p_{i,k}')} = probability of stage {renderMathFormula('k')} in segment {renderMathFormula('i')}</li>
                    <li>{renderMathFormula('q_{i,k}')} = intensity of stage {renderMathFormula('k')} in segment {renderMathFormula('i')}</li>
                    <li>Normalized: {renderMathFormula('S_{k,\\text{norm}} = 5 \\times \\frac{S_k}{\\max(S_{\\text{all}})')}</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-600 mb-3">Calculate weighted aggregation from segments to prompt level</p>
                
                {/* Detailed Calculation Breakdown */}
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Calculation Breakdown by Segment:</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {calculationSteps.step1_segmentation.map((seg, segIdx) => {
                      const segData = calculationSteps.step3_stageTagging[segIdx];
                      if (!segData) return null;
                      return (
                        <div key={segIdx} className="text-xs border-l-2 border-green-400 pl-2">
                          <div className="font-medium text-gray-700 mb-1">Segment {segIdx + 1} (w = {(seg.segment.length / calculationSteps.prompt.length).toFixed(3)}):</div>
                          {phases.map(phase => {
                            const stageData = segData.stages[phase.id as keyof typeof segData.stages];
                            if (!stageData) return null;
                            const contribution = (seg.segment.length / calculationSteps.prompt.length) * stageData.p * stageData.intensity;
                            return (
                              <div key={phase.id} className="text-gray-600 ml-2">
                                {phase.name}: {((seg.segment.length / calculationSteps.prompt.length).toFixed(3))} × {stageData.p.toFixed(2)} × {stageData.intensity.toFixed(2)} = {contribution.toFixed(4)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Plot
                  data={[{
                    type: 'table',
                    header: {
                      values: ['Stage', 'Raw Score', 'Weight', 'Normalized Score (0-5)'],
                      fill: { color: '#10B981' },
                      font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    },
                    cells: {
                      values: [
                        phases.map(p => p.name),
                        phases.map(p => calculationSteps.step4_aggregation[p.id]?.raw_score.toFixed(3) || '0.000'),
                        phases.map(p => calculationSteps.step4_aggregation[p.id]?.weight.toFixed(3) || '0.000'),
                        phases.map(p => calculationSteps.step4_aggregation[p.id]?.normalized_score.toFixed(2) || '0.00')
                      ],
                      fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                      font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    }
                  }] as any}
                  layout={{
                    height: 250,
                    margin: { l: 20, r: 20, t: 20, b: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Step 5: Emotion Adjustment */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-2">5</span>
                  Step 5: Emotion-Based Adjustment
                </h3>
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Formula:</p>
                  <div className="text-sm text-amber-800 my-2 space-y-2">
                    <div>Monitor: {renderMathFormula("S'_{\\text{monitor}} = S_{\\text{monitor}} \\times (1 + \\alpha \\times \\text{confusion})", true)}</div>
                    <div>where {renderMathFormula('\\alpha = 0.3')}</div>
                    <div>Reflect: {renderMathFormula("S'_{\\text{reflect}} = S_{\\text{reflect}} \\times (1 + \\beta \\times \\text{engagement})", true)}</div>
                    <div>where {renderMathFormula('\\beta = 0.2')}</div>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">Other stages: No adjustment ({renderMathFormula("S' = S")})</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">Adjust Monitor/Reflect stages based on sentiment analysis</p>
                <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                  <strong>Stable Adjustment Factors:</strong> α = 0.3 (Monitor), β = 0.2 (Reflect)
                </div>
                
                {/* Detailed Calculation for Monitor and Reflect */}
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Detailed Calculations:</p>
                  <div className="space-y-2 text-xs">
                    <div className="border-l-2 border-amber-400 pl-2">
                      <div className="font-medium text-gray-700 mb-1">Monitor Stage:</div>
                      <div className="text-gray-600 ml-2">
                        Before: {calculationSteps.step5_emotionAdjustment['Monitor']?.before.toFixed(3) || '0.000'}<br/>
                        Confusion Score: {calculationSteps.step2_sentiment.confusion_score.toFixed(3)}<br/>
                        Adjustment: 1 + (0.3 × {calculationSteps.step2_sentiment.confusion_score.toFixed(3)}) = {calculationSteps.step5_emotionAdjustment['Monitor']?.adjustment_factor.toFixed(3) || '1.000'}<br/>
                        After: {calculationSteps.step5_emotionAdjustment['Monitor']?.before.toFixed(3) || '0.000'} × {calculationSteps.step5_emotionAdjustment['Monitor']?.adjustment_factor.toFixed(3) || '1.000'} = {calculationSteps.step5_emotionAdjustment['Monitor']?.after.toFixed(3) || '0.000'}
                      </div>
                    </div>
                    <div className="border-l-2 border-amber-400 pl-2">
                      <div className="font-medium text-gray-700 mb-1">Reflect Stage:</div>
                      <div className="text-gray-600 ml-2">
                        Before: {calculationSteps.step5_emotionAdjustment['Reflect']?.before.toFixed(3) || '0.000'}<br/>
                        Engagement Score: {calculationSteps.step2_sentiment.engagement_score.toFixed(3)}<br/>
                        Adjustment: 1 + (0.2 × {calculationSteps.step2_sentiment.engagement_score.toFixed(3)}) = {calculationSteps.step5_emotionAdjustment['Reflect']?.adjustment_factor.toFixed(3) || '1.000'}<br/>
                        After: {calculationSteps.step5_emotionAdjustment['Reflect']?.before.toFixed(3) || '0.000'} × {calculationSteps.step5_emotionAdjustment['Reflect']?.adjustment_factor.toFixed(3) || '1.000'} = {calculationSteps.step5_emotionAdjustment['Reflect']?.after.toFixed(3) || '0.000'}
                      </div>
                    </div>
                  </div>
                </div>
                        <Plot
                          data={[{
                            type: 'table',
                            header: {
                              values: ['Stage', 'Before', 'After', 'Adjustment Factor', 'Formula'],
                              fill: { color: '#F59E0B' },
                              font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                              align: 'left'
                            },
                            cells: {
                              values: [
                                phases.map(p => p.name),
                                phases.map(p => calculationSteps.step5_emotionAdjustment[p.id]?.before.toFixed(2) || '0.00'),
                                phases.map(p => calculationSteps.step5_emotionAdjustment[p.id]?.after.toFixed(2) || '0.00'),
                                phases.map(p => calculationSteps.step5_emotionAdjustment[p.id]?.adjustment_factor.toFixed(2) || '1.00'),
                                phases.map(p => {
                                  if (p.id === 'Monitor') return 'S × (1 + α × confusion), α=0.3';
                                  if (p.id === 'Reflect') return 'S × (1 + β × engagement), β=0.2';
                                  return 'No adjustment';
                                })
                              ],
                      fill: { 
                        color: [
                          ['white', 'white', 'white', 'white', 'white', 'white', 'white'],
                          ['#FEF3C7', '#FEF3C7', '#FEF3C7', '#FEF3C7', '#FEF3C7', '#FEF3C7', '#FEF3C7']
                        ]
                      },
                      font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    }
                  }] as any}
                  layout={{
                    height: 250,
                    margin: { l: 20, r: 20, t: 20, b: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Step 6: Smoothing */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <span className="bg-violet-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-2">6</span>
                  Step 6: Temporal Smoothing (EMA)
                </h3>
                <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                  <p className="text-xs font-semibold text-violet-900 mb-1">Formula:</p>
                  <div className="text-sm text-violet-800 my-2">
                    {renderMathFormula('E_k^{(t)} = \\lambda \\times S_k^{(t)} + (1 - \\lambda) \\times E_k^{(t-1)}', true)}
                  </div>
                  <p className="text-xs text-violet-700 mb-2">Where:</p>
                  <ul className="text-xs text-violet-700 list-disc list-inside ml-2 space-y-1">
                    <li>{renderMathFormula('E_k^{(t)}')} = smoothed score for stage {renderMathFormula('k')} at time {renderMathFormula('t')}</li>
                    <li>{renderMathFormula('S_k^{(t)}')} = current score from Step 5</li>
                    <li>{renderMathFormula('E_k^{(t-1)}')} = previous smoothed score</li>
                    <li>{renderMathFormula('\\lambda = 0.3')} (smoothing factor, higher = more weight on current)</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-600 mb-3">Apply Exponential Moving Average to smooth temporal variations</p>
                
                {/* Detailed Calculation for each stage */}
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Detailed Calculations (λ = 0.3):</p>
                  <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
                    {phases.map(phase => {
                      const smoothData = calculationSteps.step6_smoothing[phase.id];
                      if (!smoothData) return null;
                      return (
                        <div key={phase.id} className="border-l-2 border-violet-400 pl-2">
                          <div className="font-medium text-gray-700">{phase.name}:</div>
                          <div className="text-gray-600 ml-2">
                            0.3 × {smoothData.current.toFixed(3)} + 0.7 × {smoothData.previous.toFixed(3)} = {smoothData.smoothed.toFixed(3)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Plot
                  data={[{
                    type: 'table',
                    header: {
                      values: ['Stage', 'Current', 'Previous', 'Smoothed', 'Lambda (λ)'],
                      fill: { color: '#8B5CF6' },
                      font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    },
                    cells: {
                      values: [
                        phases.map(p => p.name),
                        phases.map(p => calculationSteps.step6_smoothing[p.id]?.current.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.step6_smoothing[p.id]?.previous.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.step6_smoothing[p.id]?.smoothed.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.step6_smoothing[p.id]?.lambda.toFixed(2) || '0.30')
                      ],
                      fill: { color: [['white', 'white', 'white', 'white', 'white', 'white', 'white']] },
                      font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    }
                  }] as any}
                  layout={{
                    height: 250,
                    margin: { l: 20, r: 20, t: 20, b: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Final Scores */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <CheckCircle className="h-4 w-4 text-indigo-600 mr-2" />
                  Final Stage Scores (0-5 scale)
                </h3>
                <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs font-semibold text-indigo-900 mb-1">Formula:</p>
                  <div className="text-sm text-indigo-800 my-2">
                    {renderMathFormula('\\text{Final\\_Score}_k = \\frac{\\text{round}(E_k^{(t)} \\times 10)}{10}', true)}
                  </div>
                  <p className="text-xs text-indigo-700">Where {renderMathFormula('E_k^{(t)}')} is the smoothed score from Step 6, rounded to 1 decimal place</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">Final scores after all processing steps (0-5 scale)</p>
                <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Score Calculation Summary:</p>
                  <div className="space-y-1 text-xs">
                    {phases.map(phase => {
                      const finalScore = calculationSteps.final_scores[phase.id] || 0;
                      const smoothed = calculationSteps.step6_smoothing[phase.id]?.smoothed || 0;
                      return (
                        <div key={phase.id} className="flex justify-between items-center border-l-2 border-indigo-400 pl-2">
                          <span className="font-medium text-gray-700">{phase.name}:</span>
                          <span className="text-gray-600">
                            {smoothed.toFixed(3)} → round({smoothed.toFixed(3)} × 10) / 10 = {finalScore.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {phases.map((phase, idx) => {
                    const score = calculationSteps.final_scores[phase.id] || 0;
                    const colors = ['#F59E0B', '#3B82F6', '#A855F7', '#10B981', '#6366F1', '#14B8A6', '#8B5CF6'];
                    return (
                      <div key={phase.id} className="bg-white border-2 rounded-lg p-3" style={{ borderColor: colors[idx] }}>
                        <div className="text-xs font-medium text-gray-600 mb-1">{phase.name}</div>
                        <div className="text-2xl font-bold" style={{ color: colors[idx] }}>{score.toFixed(1)}</div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${(score / 5) * 100}%`, backgroundColor: colors[idx] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Session Level Calculation */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-600 mr-2" />
                  Session-Level Scoring Framework
                </h3>
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-900 mb-1">Formula:</p>
                  <div className="text-sm text-green-800 my-2">
                    {renderMathFormula('\\text{Session\\_Score}_k = \\text{Contribution}_k + (\\text{EMA\\_Trend}_k \\times 0.3) + \\text{Transition\\_Bonus}_k', true)}
                  </div>
                  <p className="text-xs text-green-700 mb-2">Where:</p>
                  <ul className="text-xs text-green-700 list-disc list-inside ml-2 space-y-1">
                    <li>{renderMathFormula('\\text{Contribution}_k = \\text{Final\\_Score}_k')} (from current calculation)</li>
                    <li>{renderMathFormula('\\text{EMA\\_Trend}_k')} = Smoothed score from Step 6</li>
                    <li>{renderMathFormula('\\text{Transition\\_Bonus}_k')} = Bonus based on stage sequence transitions</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-600 mb-3">Final Session Score = Contribution + EMA Trend + Transition Bonus</p>
                
                {/* Detailed Calculation for each stage */}
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Detailed Calculations:</p>
                  <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
                    {phases.map(phase => {
                      const contribution = calculationSteps.session_level.contribution[phase.id] || 0;
                      const emaTrend = calculationSteps.session_level.ema_trend[phase.id] || 0;
                      const transitionBonus = calculationSteps.session_level.transition_bonus[phase.id] || 0;
                      const finalSessionScore = calculationSteps.session_level.final_session_score[phase.id] || 0;
                      return (
                        <div key={phase.id} className="border-l-2 border-green-400 pl-2">
                          <div className="font-medium text-gray-700 mb-1">{phase.name}:</div>
                          <div className="text-gray-600 ml-2">
                            {contribution.toFixed(2)} + ({emaTrend.toFixed(2)} × 0.3) + {transitionBonus.toFixed(2)} = {finalSessionScore.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Plot
                  data={[{
                    type: 'table',
                    header: {
                      values: ['Stage', 'Contribution', 'EMA Trend', 'Transition Bonus', 'Final Session Score'],
                      fill: { color: '#10B981' },
                      font: { size: 12, color: 'white', family: 'Inter, system-ui, sans-serif' },
                      align: 'left'
                    },
                    cells: {
                      values: [
                        phases.map(p => p.name),
                        phases.map(p => calculationSteps.session_level.contribution[p.id]?.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.session_level.ema_trend[p.id]?.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.session_level.transition_bonus[p.id]?.toFixed(2) || '0.00'),
                        phases.map(p => calculationSteps.session_level.final_session_score[p.id]?.toFixed(2) || '0.00')
                      ],
                      fill: { 
                        color: [
                          ['white', 'white', 'white', 'white', 'white', 'white', 'white'],
                          ['#D1FAE5', '#D1FAE5', '#D1FAE5', '#D1FAE5', '#D1FAE5', '#D1FAE5', '#D1FAE5']
                        ]
                      },
                      font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                      align: 'left',
                      format: [[], ['.2f'], ['.2f'], ['.2f'], ['.2f']]
                    }
                  }] as any}
                  layout={{
                    height: 300,
                    margin: { l: 20, r: 20, t: 20, b: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {!isTeacher && (
        <StudentHinaAnalysis
          open={showHinaAnalysis}
          messages={toHinaMessages(messages)}
          sessionTitle={currentSessionTitle}
          sessions={chatHistory.map((session) => ({
            id: session.id,
            title: session.title || 'Untitled session',
            updatedAt: session.updated_at,
          }))}
          currentSessionId={currentSessionId}
          loadSessionMessages={loadHinaSessionMessages}
          onClose={() => setShowHinaAnalysis(false)}
          onJumpToMessage={handleJumpToHinaMessage}
        />
      )}

      {/* Expanded Word Cloud Modal */}
      {showExpandedWordCloud && wordCloudKeywords.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" style={{ paddingTop: '80px' }}>
          <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" style={{ maxHeight: 'calc(100vh - 100px)' }}>
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Sparkles className="h-5 w-5 text-slate-700" />
                  <span>Conversation keywords</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {wordCloudKeywords.length} topics · hover a word or pick one from the list
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWordCloudZoom(prev => Math.max(0.5, prev - 0.25))}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                  title="Zoom out"
                  disabled={wordCloudZoom <= 0.5}
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <span className="min-w-[52px] text-center text-sm font-medium tabular-nums text-slate-600">
                  {Math.round(wordCloudZoom * 100)}%
                </span>
                <button
                  onClick={() => setWordCloudZoom(prev => Math.min(2, prev + 0.25))}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                  title="Zoom in"
                  disabled={wordCloudZoom >= 2}
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    setShowExpandedWordCloud(false);
                    setWordCloudZoom(1);
                    setActiveKeyword(null);
                  }}
                  className="ml-1 rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                  title="Close expanded view"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <aside className="hidden w-64 flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-3 sm:block">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ranked topics</p>
                <ol className="space-y-1">
                  {wordCloudKeywords.slice(0, 18).map(([text, weight], index) => {
                    const maxWeight = wordCloudKeywords[0]?.[1] || 1;
                    const widthPct = Math.max(12, Math.round((weight / maxWeight) * 100));
                    const isActive = activeKeyword === text;
                    return (
                      <li key={`${text}-${index}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveKeyword(text)}
                          onFocus={() => setActiveKeyword(text)}
                          onClick={() => setActiveKeyword(text)}
                          className={`w-full rounded-lg px-2.5 py-2 text-left ring-1 transition-colors ${
                            isActive
                              ? 'bg-slate-800 text-white ring-slate-800'
                              : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium capitalize">{index + 1}. {text}</span>
                            <span className={`flex-shrink-0 text-[10px] tabular-nums ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                              {widthPct}%
                            </span>
                          </div>
                          <div className={`mt-1.5 h-1 overflow-hidden rounded-full ${isActive ? 'bg-slate-600' : 'bg-slate-100'}`}>
                            <div className={`h-full rounded-full ${isActive ? 'bg-white' : 'bg-slate-700'}`} style={{ width: `${widthPct}%` }} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white p-5" style={{ minHeight: 0, height: 'calc(100vh - 200px)' }}>
                <div
                  className="h-full w-full"
                  style={{
                    transform: `scale(${wordCloudZoom})`,
                    transformOrigin: 'center',
                    transition: 'transform 0.2s ease-in-out',
                  }}
                >
                  <WordCloudCanvas
                    words={wordCloudKeywords}
                    height={620}
                    activeWord={activeKeyword}
                    onWordHover={(word) => {
                      if (word) setActiveKeyword(word);
                    }}
                    onWordClick={setActiveKeyword}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AITestChatbox;