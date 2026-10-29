import { kimiLabelCompletion } from '../services/kimiLabelService';
import { supabase } from '../lib/supabase';
import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  getDimensionMeta,
  type HinaActor,
  type HinaDimension,
} from './hinaCodes';
import { codeHinaMessage, type HinaCodedMessage, type HinaSourceMessage } from './hinaAnalysis';

export interface HinaLabelRow {
  messageId: string;
  turn: number;
  speaker: 'Student' | 'Tutor';
  actor: HinaActor;
  dimension: HinaDimension;
  dimensionLabel: string;
  codeId: string;
  codeLabel: string;
  definition: string;
  evidence: string;
  rationale: string;
  source: 'gemini' | 'heuristic';
}

const excerptOf = (text: string, limit = 180) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const CODE_BY_NORMALIZED = new Map(
  HINA_CODES.flatMap((code) => [
    [normalizeKey(code.id), code],
    [normalizeKey(code.label), code],
    [normalizeKey(code.shortLabel), code],
  ])
);

const DIMENSION_BY_NORMALIZED = new Map(
  HINA_DIMENSIONS.map((item) => [normalizeKey(item.label), item.id] as const)
);

export const resolveHinaCode = (rawCode?: string, rawDimension?: string) => {
  const fromCode = rawCode ? CODE_BY_NORMALIZED.get(normalizeKey(rawCode)) : undefined;
  if (fromCode) return fromCode;
  if (!rawDimension) return undefined;
  const dimension = DIMENSION_BY_NORMALIZED.get(normalizeKey(rawDimension));
  return dimension ? HINA_CODES.find((code) => code.dimension === dimension) : undefined;
};

export const heuristicLabelRows = (messages: HinaSourceMessage[]): HinaLabelRow[] =>
  messages
    .map((message, index) => {
      const coded = codeHinaMessage(message);
      if (!coded) return null;
      return codedMessageToRow(coded, index + 1, message.content, 'heuristic');
    })
    .filter((row): row is HinaLabelRow => Boolean(row));

export const codedMessageToRow = (
  coded: HinaCodedMessage,
  turn: number,
  originalText: string,
  source: HinaLabelRow['source'],
  rationale = 'Matched from the current 19-code codebook.'
): HinaLabelRow => {
  const code = HINA_CODE_BY_ID[coded.codeId];
  const dimension = getDimensionMeta(coded.dimension);
  return {
    messageId: coded.messageId,
    turn,
    speaker: coded.actor === 'me' ? 'Student' : 'Tutor',
    actor: coded.actor,
    dimension: coded.dimension,
    dimensionLabel: dimension.label,
    codeId: coded.codeId,
    codeLabel: code?.label ?? coded.codeId,
    definition: code?.prompt ?? '',
    evidence: coded.excerpt || excerptOf(originalText),
    rationale,
    source,
  };
};

export const rowsToCodedMessages = (rows: HinaLabelRow[]): HinaCodedMessage[] =>
  rows.map((row) => ({
    messageId: row.messageId,
    actor: row.actor,
    codeId: row.codeId,
    dimension: row.dimension,
    excerpt: row.evidence,
  }));

const codebookBlock = () =>
  HINA_CODES.map(
    (code, index) =>
      `${index + 1}. id=${code.id} | dimension=${getDimensionMeta(code.dimension).label} | code=${code.label} | definition=${code.prompt}`
  ).join('\n');

const extractJson = (text: string): unknown | null => {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const block = fenced
    || (trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0])
    || (trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed : trimmed.match(/\[[\s\S]*\]/)?.[0]);
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
};

const parseGeminiRows = (raw: unknown, messages: HinaSourceMessage[]): HinaLabelRow[] | null => {
  if (!raw) return null;
  const payload = Array.isArray(raw)
    ? { rows: raw }
    : (raw as { rows?: unknown; labels?: unknown });
  const list = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.labels) ? payload.labels : null;
  if (!list) return null;

  const byId = new Map(messages.map((message) => [message.id, message]));
  const rows: HinaLabelRow[] = [];

  list.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const entry = item as Record<string, unknown>;
    const turn = Number(entry.turn) || index + 1;
    const message =
      (typeof entry.messageId === 'string' && byId.get(entry.messageId)) ||
      messages[turn - 1] ||
      messages[index];
    if (!message) return;

    const actor: HinaActor = message.role === 'user' ? 'me' : 'ai';
    const code = resolveHinaCode(
      String(entry.codeId || entry.code || entry.label || ''),
      String(entry.dimension || '')
    ) ?? HINA_CODE_BY_ID[codeHinaMessage(message)?.codeId || 'idea-explanation-sharing'];
    if (!code) return;

    rows.push({
      messageId: message.id,
      turn,
      speaker: actor === 'me' ? 'Student' : 'Tutor',
      actor,
      dimension: code.dimension,
      dimensionLabel: getDimensionMeta(code.dimension).label,
      codeId: code.id,
      codeLabel: code.label,
      definition: code.prompt,
      evidence: excerptOf(String(entry.evidence || entry.excerpt || message.content || '')),
      rationale: excerptOf(String(entry.rationale || entry.why || entry.reason || ''), 220),
      source: 'gemini',
    });
  });

  return rows.length ? rows : null;
};

export const labelHinaMessagesWithGemini = async (
  messages: HinaSourceMessage[]
): Promise<{ rows: HinaLabelRow[]; source: 'gemini' | 'heuristic' }> => {
  const fallback = heuristicLabelRows(messages);
  if (messages.length === 0) return { rows: fallback, source: 'heuristic' };

  if (import.meta.env.VITE_HINA_LABEL_EDGE === 'true' && supabase) {
    const { labelHinaMessagesViaEdge } = await import('../services/hinaEdgeLabel');
    return labelHinaMessagesViaEdge(supabase, messages);
  }

  const turns = messages.slice(0, 40).map((message, index) => ({
    turn: index + 1,
    messageId: message.id,
    speaker: message.role === 'user' ? 'Student' : 'Tutor',
    text: excerptOf(message.content, 700),
  }));

  const prompt = `You are coding a 1-to-1 student–AI tutor chat with the HINA codebook below.
Assign EXACTLY one code to EACH turn. Do not invent codes. Dimension must match the chosen code.

CODEBOOK:
${codebookBlock()}

CODING RULES:
- Direct Solution Request: asking for the finished answer or complete work.
- Information / Idea Question: asking for an idea, meaning, or explanation — not the finished answer.
- Extend / Refine Request: asking to change existing content. Extend / Refine Solution: actually modifying a solution.
- Direct Solution Provide: handing over a complete answer. Idea / Explanation Sharing: explaining without dumping the full answer.
- Build on Question: following up on the previous turn.
- Critical Assessment: challenging or judging an idea.
- Integration / Synthesis: connecting several ideas.
- Planning / Monitoring / Evaluation: process moves, not content answers.
- Socio-emotional codes only for greeting, thanks, empathy, or brief agreement.
- Coordinative codes for task scope, who does what, or tools/files.
- Prefer the most specific matching code. One code per turn.

TURNS:
${turns.map((turn) => `[${turn.turn}] id=${turn.messageId} ${turn.speaker}: ${turn.text}`).join('\n\n')}

Return ONLY JSON with this schema:
{
  "rows": [
    {
      "turn": 1,
      "messageId": "same id as the turn",
      "speaker": "Student or Tutor",
      "dimension": "Cognitive | Metacognitive | Socio-emotional | Coordinative",
      "code": "exact code name from the codebook",
      "codeId": "exact id from the codebook",
      "evidence": "short quote from the turn",
      "rationale": "one sentence: why this code rather than a nearby one"
    }
  ]
}`;

  try {
    const response = await kimiLabelCompletion(prompt);
    const parsed = parseGeminiRows(extractJson(response), messages.slice(0, 40));
    if (parsed && parsed.length > 0) {
      const remaining = fallback.slice(parsed.length);
      return { rows: [...parsed, ...remaining], source: 'gemini' };
    }
  } catch (error) {
    console.error('HINA Kimi labelling failed:', error);
  }

  return { rows: fallback, source: 'heuristic' };
};
