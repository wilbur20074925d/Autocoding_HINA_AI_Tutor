import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  type HinaActor,
  type HinaDimension,
  type HinaCodeDef,
} from './hinaCodes';

export interface HinaSourceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date | string;
  detectedStage?: string;
}

export interface HinaCodedMessage {
  messageId: string;
  actor: HinaActor;
  codeId: string;
  dimension: HinaDimension;
  excerpt: string;
  timestamp?: string;
}

export interface HinaEdge {
  actor: HinaActor;
  codeId: string;
  weight: number;
  messageIds: string[];
  significant: boolean;
  pValue: number;
}

export interface HinaProfile {
  codedCount: number;
  edges: HinaEdge[];
  quantityByActor: Record<HinaActor, number>;
  quantityByDimension: Record<HinaActor, Record<HinaDimension, number>>;
  diversityByActor: Record<HinaActor, number>;
  topCodes: Array<{ actor: HinaActor; code: HinaCodeDef; weight: number }>;
  codedMessages: HinaCodedMessage[];
}

const MIN_CODES_FOR_PRUNE = 15;

const STAGE_HINTS: Array<{ stage: string; codeId: string }> = [
  { stage: 'Strategize', codeId: 'planning' },
  { stage: 'Plan', codeId: 'planning' },
  { stage: 'Monitor', codeId: 'monitoring' },
  { stage: 'Verify', codeId: 'evaluation' },
  { stage: 'Reflect', codeId: 'evaluation' },
  { stage: 'Clarify', codeId: 'information-idea-question' },
  { stage: 'Orient', codeId: 'task-clarification' },
];

const excerptOf = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
};

const scoreCode = (text: string, role: 'user' | 'assistant', code: HinaCodeDef): number => {
  let score = 0;
  for (const pattern of code.patterns) {
    if (pattern.test(text)) score += 2;
  }
  if (role === 'user' && code.id === 'direct-solution-request' && /\?/.test(text) && /\b(code|answer|solution|write)\b/i.test(text)) {
    score += 1;
  }
  if (role === 'user' && code.id === 'extend-refine-request' && /\b(change|modify|improve|refine|extend)\b/i.test(text)) {
    score += 1;
  }
  if (role === 'assistant' && code.id === 'direct-solution-provide' && /```/.test(text) && text.length > 400) {
    score += 3;
  }
  if (role === 'assistant' && code.id === 'extend-refine-solution' && /\b(updated|revised|refined|improved version)\b/i.test(text)) {
    score += 2;
  }
  if (role === 'assistant' && code.id === 'idea-explanation-sharing' && text.length > 280 && !/```[\s\S]{80,}/.test(text)) {
    score += 1;
  }
  return score;
};

export const codeHinaMessage = (message: HinaSourceMessage): HinaCodedMessage | null => {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const text = message.content || '';
  if (!text.trim()) return null;

  const actor: HinaActor = message.role === 'user' ? 'me' : 'ai';
  let best = HINA_CODES[0];
  let bestScore = -1;

  for (const code of HINA_CODES) {
    const score = scoreCode(text, message.role, code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  if (bestScore <= 0 && message.detectedStage) {
    const hint = STAGE_HINTS.find((item) => item.stage === message.detectedStage);
    if (hint) best = HINA_CODE_BY_ID[hint.codeId] ?? best;
  } else if (bestScore <= 0) {
    if (actor === 'me') {
      best = /\?/.test(text) ? HINA_CODE_BY_ID['information-idea-question'] : HINA_CODE_BY_ID['idea-explanation-sharing'];
    } else {
      best = /```/.test(text)
        ? HINA_CODE_BY_ID['direct-solution-provide']
        : HINA_CODE_BY_ID['idea-explanation-sharing'];
    }
  }

  return {
    messageId: message.id,
    actor,
    codeId: best.id,
    dimension: best.dimension,
    excerpt: excerptOf(text),
    timestamp: message.timestamp
      ? message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : String(message.timestamp)
      : undefined,
  };
};

const emptyDimensionCounts = (): Record<HinaDimension, number> => ({
  cognitive: 0,
  metacognitive: 0,
  'socio-emotional': 0,
  coordinative: 0,
});

const logFact = (n: number): number => {
  let value = 0;
  for (let i = 2; i <= n; i += 1) value += Math.log(i);
  return value;
};

const binomLogPmF = (k: number, n: number, p: number): number => {
  if (k < 0 || k > n) return -Infinity;
  if (p <= 0) return k === 0 ? 0 : -Infinity;
  if (p >= 1) return k === n ? 0 : -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
};

/** P(X >= k) for X ~ Binomial(n, p). */
export const binomialSurvival = (k: number, n: number, p: number): number => {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  for (let x = k; x <= n; x += 1) {
    total += Math.exp(binomLogPmF(x, n, p));
  }
  return Math.min(1, total);
};

const shannonDiversity = (weights: number[], universeSize: number): number => {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || universeSize <= 1) return 0;
  const entropy = weights.reduce((sum, value) => {
    if (value <= 0) return sum;
    const p = value / total;
    return sum - p * Math.log2(p);
  }, 0);
  return entropy / Math.log2(universeSize);
};

export const buildHinaProfileFromCoded = (codedMessages: HinaCodedMessage[]): HinaProfile => {
  const bucket = new Map<string, HinaEdge>();
  const quantityByActor: Record<HinaActor, number> = { me: 0, ai: 0 };
  const quantityByDimension: Record<HinaActor, Record<HinaDimension, number>> = {
    me: emptyDimensionCounts(),
    ai: emptyDimensionCounts(),
  };

  for (const coded of codedMessages) {
    const key = `${coded.actor}::${coded.codeId}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.weight += 1;
      existing.messageIds.push(coded.messageId);
    } else {
      bucket.set(key, {
        actor: coded.actor,
        codeId: coded.codeId,
        weight: 1,
        messageIds: [coded.messageId],
        significant: false,
        pValue: 1,
      });
    }
    quantityByActor[coded.actor] += 1;
    quantityByDimension[coded.actor][coded.dimension] += 1;
  }

  const nCodes = HINA_CODES.length;
  const canPrune = codedMessages.length >= MIN_CODES_FOR_PRUNE;
  const edges = Array.from(bucket.values()).map((edge) => {
    const actorTotal = quantityByActor[edge.actor] || 1;
    const pValue = canPrune ? binomialSurvival(edge.weight, actorTotal, 1 / nCodes) : 1;
    return {
      ...edge,
      pValue,
      significant: canPrune && pValue < 0.05,
    };
  });

  const weightsFor = (actor: HinaActor) =>
    HINA_CODES.map((code) => edges.find((edge) => edge.actor === actor && edge.codeId === code.id)?.weight || 0);

  const diversityByActor: Record<HinaActor, number> = {
    me: shannonDiversity(weightsFor('me'), nCodes),
    ai: shannonDiversity(weightsFor('ai'), nCodes),
  };

  const topCodes = edges
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((edge) => ({
      actor: edge.actor,
      code: HINA_CODE_BY_ID[edge.codeId],
      weight: edge.weight,
    }))
    .filter((item) => Boolean(item.code));

  return {
    codedCount: codedMessages.length,
    edges,
    quantityByActor,
    quantityByDimension,
    diversityByActor,
    topCodes,
    codedMessages,
  };
};

export const buildHinaProfile = (messages: HinaSourceMessage[]): HinaProfile =>
  buildHinaProfileFromCoded(
    messages.map(codeHinaMessage).filter((item): item is HinaCodedMessage => Boolean(item))
  );

export const canPruneHinaEdges = (codedCount: number) => codedCount >= MIN_CODES_FOR_PRUNE;

export const messagesForCode = (
  profile: HinaProfile,
  codeId: string,
  actor?: HinaActor
): HinaCodedMessage[] =>
  profile.codedMessages.filter(
    (item) => item.codeId === codeId && (actor ? item.actor === actor : true)
  );

export const dimensionTotals = (profile: HinaProfile, actor: HinaActor) =>
  HINA_DIMENSIONS.map((dimension) => profile.quantityByDimension[actor][dimension.id] || 0);

export const interpretDiversity = (value: number): { label: string; hint: string } => {
  if (value < 0.28) {
    return {
      label: 'Narrow',
      hint: 'Most turns use only one or two moves. A common pattern is repeating Direct Solution Request.',
    };
  }
  if (value < 0.55) {
    return {
      label: 'Mixed',
      hint: 'You use a few strategies, but the conversation still leans on a small set of moves.',
    };
  }
  return {
    label: 'Broad',
    hint: 'Questions, planning, checking, and explaining all show up. That is closer to working through the problem together.',
  };
};

export const interpretPortrait = (profile: HinaProfile): string => {
  const meRequest = profile.edges.find((edge) => edge.actor === 'me' && edge.codeId === 'direct-solution-request')?.weight || 0;
  const aiProvide = profile.edges.find((edge) => edge.actor === 'ai' && edge.codeId === 'direct-solution-provide')?.weight || 0;
  const mePlan = (profile.quantityByDimension.me.metacognitive || 0);
  const socio = (profile.quantityByDimension.me['socio-emotional'] || 0) + (profile.quantityByDimension.ai['socio-emotional'] || 0);
  const coord = (profile.quantityByDimension.me.coordinative || 0) + (profile.quantityByDimension.ai.coordinative || 0);

  const notes: string[] = [];
  if (meRequest > 0 && aiProvide >= meRequest) {
    notes.push('You ask for answers and the tutor often provides them — a “give me the solution” loop.');
  }
  if (mePlan > 0) {
    notes.push('Planning or monitoring is present, which looks more like thinking together than only collecting answers.');
  }
  if (socio === 0 && coord === 0) {
    notes.push('Socio-emotional and coordinative moves are rare in 1:1 tutoring. That is common, not a fault.');
  }
  return notes.join(' ');
};

/** Node-level HINA reading: quantity × diversity of ego–code ties. */
export const interpretNodeLevel = (profile: HinaProfile): {
  summary: string;
  quantityHint: string;
  diversityHint: string;
  nextStep: string;
} => {
  const meQty = profile.quantityByActor.me;
  const diversity = interpretDiversity(profile.diversityByActor.me);
  const topMe = profile.topCodes.find((item) => item.actor === 'me');
  const requestShare =
    meQty > 0
      ? (profile.edges.find((edge) => edge.actor === 'me' && edge.codeId === 'direct-solution-request')?.weight || 0) / meQty
      : 0;
  const metaShare = meQty > 0 ? (profile.quantityByDimension.me.metacognitive || 0) / meQty : 0;

  let quantityHint =
    meQty < 4
      ? 'Few coded turns so far — treat these numbers as a sketch, not a stable portrait.'
      : meQty < 12
        ? 'A modest amount of coded talk. Patterns may still shift with a few more turns.'
        : 'Enough coded turns for a reasonably stable quantity reading.';

  let nextStep =
    'Try asking how or why before asking for the finished answer, then check your own solution.';
  if (requestShare >= 0.45) {
    nextStep = 'Pause before “give me the answer”: restate the goal, ask one clarifying question, then try a short plan.';
  } else if (metaShare >= 0.25) {
    nextStep = 'Keep the planning/monitoring habit — add one verification step after the tutor replies.';
  } else if (diversity.label === 'Narrow') {
    nextStep = 'Stretch the strategy set: mix an idea question, a refine request, and a quick self-check.';
  }

  const summaryParts = [
    `Your node-level profile shows ${meQty} coded student turn${meQty === 1 ? '' : 's'} with ${diversity.label.toLowerCase()} strategy diversity.`,
  ];
  if (topMe?.code) {
    summaryParts.push(`The strongest student–code tie is “${topMe.code.label}” (${topMe.weight}).`);
  }
  const portrait = interpretPortrait(profile);
  if (portrait) summaryParts.push(portrait);

  return {
    summary: summaryParts.join(' '),
    quantityHint,
    diversityHint: diversity.hint,
    nextStep,
  };
};

export const interpretDyadicPatterns = (
  edges: HinaEdge[],
  pruneReady: boolean
): { summary: string; significantCount: number; hint: string } => {
  const significant = edges.filter((edge) => edge.significant);
  if (!pruneReady) {
    return {
      summary: 'This chat is still too short for dyadic pruning. Weighted ties are shown, but none are marked statistically stable yet.',
      significantCount: 0,
      hint: 'HINA marks an edge as significant when its weight is unlikely under a uniform null (binomial test, α = 0.05). Aim for more coded turns.',
    };
  }
  if (significant.length === 0) {
    return {
      summary: 'No student–code or tutor–code ties cleared the significance filter in this window.',
      significantCount: 0,
      hint: 'Absence of stable edges often means the strategy mix is still diffuse — or the sample is borderline.',
    };
  }
  const top = significant.slice().sort((a, b) => b.weight - a.weight)[0];
  const code = HINA_CODE_BY_ID[top.codeId];
  return {
    summary: `${significant.length} habitual tie${significant.length === 1 ? '' : 's'} look systematic. Strongest: ${top.actor === 'me' ? 'You' : 'Tutor'} ↔ ${code?.label || top.codeId} (weight ${top.weight}).`,
    significantCount: significant.length,
    hint: 'Significant edges are the moves you keep returning to — useful for noticing answer-seeking loops versus planning or critique.',
  };
};
