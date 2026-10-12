import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  type HinaDimension,
} from './hinaCodes';
import {
  binomialSurvival,
  buildHinaProfileFromCoded,
  canPruneHinaEdges,
  codeHinaMessage,
  interpretDiversity,
  type HinaCodedMessage,
  type HinaProfile,
  type HinaSourceMessage,
} from './hinaAnalysis';

export interface HinaClassTurn {
  studentId: string;
  studentName: string;
  sessionId: string;
  sessionTitle: string;
  sessionUpdatedAt: string;
  message: HinaSourceMessage;
  stage?: string;
  messageRole?: string;
}

export interface HinaClassCodedTurn extends HinaCodedMessage {
  studentId: string;
  studentName: string;
  sessionId: string;
  sessionTitle: string;
  content: string;
  target: 'AI';
  stage?: string;
  messageRole?: string;
}

export interface HinaClassEdge {
  studentId: string;
  studentName: string;
  codeId: string;
  target: 'AI';
  weight: number;
  messageIds: string[];
  sessionIds: string[];
  significant: boolean;
  pValue: number;
}

export interface HinaClassStudentRow {
  userId: string;
  name: string;
  sessionCount: number;
  sessionIds: string[];
  codedCount: number;
  quantity: number;
  quantityAi: number;
  normalizedQuantity: number;
  diversity: number;
  diversityLabel: string;
  quantityByDimension: Record<HinaDimension, number>;
  topCodeId: string | null;
  requestShare: number;
  questionShare: number;
  refineShare: number;
  metaShare: number;
  profile: HinaProfile;
  clusterId: number;
  clusterLabel: string;
}

export interface HinaClassCluster {
  id: number;
  label: string;
  hint: string;
  action: string;
  studentIds: string[];
}

export interface HinaProjectionLink {
  source: string;
  target: string;
  weight: number;
}

export interface HinaClassOverlay {
  stageCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  executeRequest: number;
  executeTotal: number;
  requestProvidePairs: number;
}

export interface HinaClassAnalysis {
  codedTurns: HinaClassCodedTurn[];
  students: HinaClassStudentRow[];
  classEdges: HinaClassEdge[];
  compositeEdges: HinaClassEdge[];
  projection: HinaProjectionLink[];
  clusters: HinaClassCluster[];
  overlay: HinaClassOverlay;
  codedCount: number;
  pruneReady: boolean;
}

const share = (part: number, total: number) => (total > 0 ? part / total : 0);

const weightOf = (profile: HinaProfile, actor: 'me' | 'ai', codeId: string) =>
  profile.edges.find((edge) => edge.actor === actor && edge.codeId === codeId)?.weight || 0;

export const toHinaSourceMessage = (row: {
  id: string;
  role: string;
  content: string;
  created_at?: string;
  timestamp?: Date | string;
  metadata?: { detectedStage?: string; messageRole?: string };
}): HinaSourceMessage | null => {
  if (row.role !== 'user' && row.role !== 'assistant') return null;
  return {
    id: row.id,
    role: row.role,
    content: row.content || '',
    timestamp: row.timestamp ?? row.created_at,
    detectedStage: row.metadata?.detectedStage,
  };
};

const labelCluster = (centroid: number[], meanQuantity: number, classMeanQuantity: number) => {
  const index = (id: string) => HINA_CODES.findIndex((code) => code.id === id);
  const request = centroid[index('direct-solution-request')] || 0;
  const question = centroid[index('information-idea-question')] || 0;
  const refine = (centroid[index('extend-refine-request')] || 0) + (centroid[index('extend-refine-solution')] || 0);
  const meta =
    (centroid[index('planning')] || 0) +
    (centroid[index('monitoring')] || 0) +
    (centroid[index('evaluation')] || 0);

  if (classMeanQuantity > 0 && meanQuantity < classMeanQuantity * 0.35) {
    return {
      label: 'Low engagement',
      hint: 'Few coded ties and low diversity. Students may be stuck, avoiding the tutor, or finished early.',
      action: 'Check in: is the task unclear, or do they not know how to start with the tutor?',
    };
  }
  if (request >= question && request >= refine && request >= meta && request > 0.12) {
    return {
      label: 'Answer-seeking',
      hint: 'Strong student ties to Direct Solution Request; the tutor often answers with Direct solution provide.',
      action: 'Raise scaffolding, delay full code, and prompt Planning before a finished solution.',
    };
  }
  if (question >= refine && question >= meta && question > 0.1) {
    return {
      label: 'Questioning',
      hint: 'Students lean on information / idea questions and explanation sharing.',
      action: 'Keep this pattern. These chats are useful peer exemplars.',
    };
  }
  if (refine >= meta && refine > 0.1) {
    return {
      label: 'Iterative refining',
      hint: 'Extend / Refine request and solution dominate. Students are iterating rather than collecting a first answer.',
      action: 'Encourage Evaluation so they also judge whether the refined work is good enough.',
    };
  }
  if (meta > 0.1) {
    return {
      label: 'Metacognitive',
      hint: 'Planning, monitoring, or evaluation show up more than in the rest of the class.',
      action: 'Share this process with the class. Quantity is not the point here — strategy is.',
    };
  }
  return {
    label: 'Mixed strategy',
    hint: 'No single move dominates. Students mix questions, requests, and process talk.',
    action: 'Watch individual rows for hidden answer-seeking inside an otherwise mixed profile.',
  };
};

const kMeans = (vectors: number[][], k: number, rounds = 28): number[] => {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0 || dim === 0 || k <= 1) return vectors.map(() => 0);

  const centroids: number[][] = [];
  const used = new Set<number>();
  centroids.push(vectors[0].slice());
  used.add(0);
  while (centroids.length < k) {
    let best = 0;
    let bestDist = -1;
    for (let i = 0; i < n; i += 1) {
      if (used.has(i)) continue;
      const dist = Math.min(
        ...centroids.map((center) =>
          center.reduce((sum, value, index) => sum + (value - vectors[i][index]) ** 2, 0)
        )
      );
      if (dist > bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    used.add(best);
    centroids.push(vectors[best].slice());
  }

  let labels = vectors.map(() => 0);
  for (let round = 0; round < rounds; round += 1) {
    labels = vectors.map((vector) => {
      let nearest = 0;
      let nearestDist = Infinity;
      centroids.forEach((center, index) => {
        const dist = center.reduce((sum, value, dimIndex) => sum + (value - vector[dimIndex]) ** 2, 0);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = index;
        }
      });
      return nearest;
    });
    const next = Array.from({ length: k }, () => Array.from({ length: dim }, () => 0));
    const counts = Array.from({ length: k }, () => 0);
    vectors.forEach((vector, index) => {
      counts[labels[index]] += 1;
      vector.forEach((value, dimIndex) => {
        next[labels[index]][dimIndex] += value;
      });
    });
    next.forEach((center, index) => {
      if (counts[index] === 0) return;
      centroids[index] = center.map((value) => value / counts[index]);
    });
  }
  return labels;
};

const clusterStudents = (rows: HinaClassStudentRow[]): { rows: HinaClassStudentRow[]; clusters: HinaClassCluster[] } => {
  if (rows.length < 3) {
    return {
      rows: rows.map((row) => ({ ...row, clusterId: 0, clusterLabel: 'Whole class' })),
      clusters: [
        {
          id: 0,
          label: 'Whole class',
          hint: 'Need at least three students before HINA can infer strategy clusters.',
          action: 'Load more roster chats, then reopen this view.',
          studentIds: rows.map((row) => row.userId),
        },
      ],
    };
  }

  const vectors = rows.map((row) =>
    HINA_CODES.map((code) => share(weightOf(row.profile, 'me', code.id), Math.max(1, row.quantity)))
  );
  const k = Math.min(5, Math.max(2, Math.round(Math.sqrt(rows.length))));
  const labels = kMeans(vectors, k);
  const classMean = rows.reduce((sum, row) => sum + row.quantity, 0) / rows.length;

  const clusters: HinaClassCluster[] = [];
  for (let id = 0; id < k; id += 1) {
    const members = rows.filter((_, index) => labels[index] === id);
    if (members.length === 0) continue;
    const centroid = HINA_CODES.map((_, codeIndex) => {
      const total = members.reduce((sum, _row, memberIndex) => {
        const rowIndex = rows.findIndex((item) => item.userId === members[memberIndex].userId);
        return sum + (vectors[rowIndex]?.[codeIndex] || 0);
      }, 0);
      return total / members.length;
    });
    const meanQuantity = members.reduce((sum, row) => sum + row.quantity, 0) / members.length;
    const named = labelCluster(centroid, meanQuantity, classMean);
    clusters.push({
      id,
      ...named,
      studentIds: members.map((row) => row.userId),
    });
  }

  const labelled = rows.map((row, index) => {
    const cluster = clusters.find((item) => item.id === labels[index]);
    return {
      ...row,
      clusterId: cluster?.id ?? 0,
      clusterLabel: cluster?.label ?? 'Mixed strategy',
    };
  });

  return { rows: labelled, clusters };
};

const buildProjection = (students: HinaClassStudentRow[]): HinaProjectionLink[] => {
  const links = new Map<string, number>();
  students.forEach((student) => {
    const used = HINA_CODES.filter((code) => weightOf(student.profile, 'me', code.id) > 0 || weightOf(student.profile, 'ai', code.id) > 0);
    for (let i = 0; i < used.length; i += 1) {
      for (let j = i + 1; j < used.length; j += 1) {
        const a = used[i].id;
        const b = used[j].id;
        const key = a < b ? `${a}::${b}` : `${b}::${a}`;
        const weight =
          Math.min(
            weightOf(student.profile, 'me', a) + weightOf(student.profile, 'ai', a),
            weightOf(student.profile, 'me', b) + weightOf(student.profile, 'ai', b)
          ) || 1;
        links.set(key, (links.get(key) || 0) + weight);
      }
    }
  });
  return [...links.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('::');
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight);
};

const buildOverlay = (turns: HinaClassCodedTurn[]): HinaClassOverlay => {
  const stageCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  let executeTotal = 0;
  let executeRequest = 0;
  let requestProvidePairs = 0;

  turns.forEach((turn, index) => {
    if (turn.actor === 'me' && turn.stage) {
      stageCounts[turn.stage] = (stageCounts[turn.stage] || 0) + 1;
      if (turn.stage === 'Execute') {
        executeTotal += 1;
        if (turn.codeId === 'direct-solution-request') executeRequest += 1;
      }
    }
    if (turn.messageRole) {
      roleCounts[turn.messageRole] = (roleCounts[turn.messageRole] || 0) + 1;
    }
    const next = turns[index + 1];
    if (
      turn.actor === 'me' &&
      turn.codeId === 'direct-solution-request' &&
      next &&
      next.sessionId === turn.sessionId &&
      next.actor === 'ai' &&
      next.codeId === 'direct-solution-provide'
    ) {
      requestProvidePairs += 1;
    }
  });

  return { stageCounts, roleCounts, executeRequest, executeTotal, requestProvidePairs };
};

export const buildHinaClassAnalysis = (turns: HinaClassTurn[]): HinaClassAnalysis => {
  const codedTurns: HinaClassCodedTurn[] = turns
    .map((turn) => {
      const coded = codeHinaMessage(turn.message);
      if (!coded) return null;
      return {
        ...coded,
        studentId: turn.studentId,
        studentName: turn.studentName,
        sessionId: turn.sessionId,
        sessionTitle: turn.sessionTitle,
        content: turn.message.content || coded.excerpt,
        target: 'AI' as const,
        stage: turn.stage || turn.message.detectedStage,
        messageRole: turn.messageRole,
      };
    })
    .filter((item): item is HinaClassCodedTurn => Boolean(item));

  const byStudent = new Map<string, HinaClassCodedTurn[]>();
  codedTurns.forEach((turn) => {
    const list = byStudent.get(turn.studentId) || [];
    list.push(turn);
    byStudent.set(turn.studentId, list);
  });

  const rawStudents: HinaClassStudentRow[] = [...byStudent.entries()].map(([userId, studentTurns]) => {
    const profile = buildHinaProfileFromCoded(studentTurns);
    const quantity = profile.quantityByActor.me;
    const sessions = new Set(studentTurns.map((turn) => turn.sessionId));
    return {
      userId,
      name: studentTurns[0]?.studentName || 'Student',
      sessionCount: sessions.size,
      sessionIds: [...sessions],
      codedCount: profile.codedCount,
      quantity,
      quantityAi: profile.quantityByActor.ai,
      normalizedQuantity: 0,
      diversity: profile.diversityByActor.me,
      diversityLabel: interpretDiversity(profile.diversityByActor.me).label,
      quantityByDimension: { ...profile.quantityByDimension.me },
      topCodeId: profile.topCodes.find((item) => item.actor === 'me')?.code.id || null,
      requestShare: share(weightOf(profile, 'me', 'direct-solution-request'), quantity),
      questionShare: share(weightOf(profile, 'me', 'information-idea-question'), quantity),
      refineShare: share(weightOf(profile, 'me', 'extend-refine-request'), quantity),
      metaShare: share(profile.quantityByDimension.me.metacognitive, quantity),
      profile,
      clusterId: 0,
      clusterLabel: 'Mixed strategy',
    };
  });

  const classTotal = rawStudents.reduce((sum, row) => sum + row.quantity, 0);
  rawStudents.forEach((row) => {
    row.normalizedQuantity = classTotal > 0 ? row.quantity / classTotal : 0;
  });
  rawStudents.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

  const clustered = clusterStudents(rawStudents);

  const classEdges: HinaClassEdge[] = [];
  clustered.rows.forEach((student) => {
    HINA_CODES.forEach((code) => {
      const edge = student.profile.edges.find((item) => item.actor === 'me' && item.codeId === code.id);
      if (!edge || edge.weight <= 0) return;
      const pValue =
        student.quantity >= 8 ? binomialSurvival(edge.weight, student.quantity, 1 / HINA_CODES.length) : 1;
        classEdges.push({
        studentId: student.userId,
        studentName: student.name,
        codeId: code.id,
        target: 'AI',
        weight: edge.weight,
        messageIds: edge.messageIds,
        sessionIds: student.sessionIds,
        significant: student.quantity >= 8 && pValue < 0.05,
        pValue,
      });
    });
  });

  const compositeEdges = classEdges.map((edge) => ({ ...edge }));

  return {
    codedTurns,
    students: clustered.rows,
    classEdges,
    compositeEdges,
    projection: buildProjection(clustered.rows),
    clusters: clustered.clusters,
    overlay: buildOverlay(codedTurns),
    codedCount: codedTurns.length,
    pruneReady: canPruneHinaEdges(codedTurns.length) && clustered.rows.some((row) => row.quantity >= 8),
  };
};

export const classQuotesFor = (
  analysis: HinaClassAnalysis,
  options: { codeId?: string | null; studentId?: string | null }
): HinaClassCodedTurn[] =>
  analysis.codedTurns.filter((turn) => {
    if (options.codeId && turn.codeId !== options.codeId) return false;
    if (options.studentId && turn.studentId !== options.studentId) return false;
    return turn.actor === 'me' || Boolean(options.codeId);
  });

/** Teacher-facing readings aligned with HINA’s three analytical levels. */
export const interpretClassNodeLevel = (analysis: HinaClassAnalysis): {
  summary: string;
  lowEngagement: string[];
  narrowStrategy: string[];
  exemplars: string[];
  hint: string;
} => {
  const students = analysis.students;
  if (students.length === 0) {
    return {
      summary: 'No coded student turns in this slice yet.',
      lowEngagement: [],
      narrowStrategy: [],
      exemplars: [],
      hint: 'Widen the time window or load sessions that contain student–AI messages.',
    };
  }
  const meanQty = students.reduce((sum, row) => sum + row.quantity, 0) / students.length;
  const lowEngagement = students.filter((row) => row.quantity <= Math.max(2, meanQty * 0.35)).map((row) => row.name);
  const narrowStrategy = students.filter((row) => row.diversity < 0.28 && row.quantity >= 4).map((row) => row.name);
  const exemplars = students
    .filter((row) => row.metaShare >= 0.2 || (row.diversity >= 0.55 && row.quantity >= 4))
    .slice(0, 5)
    .map((row) => row.name);

  return {
    summary: `Node-level HINA covers ${students.length} student${students.length === 1 ? '' : 's'}: quantity (how much coded talk) and diversity (how many distinct codes). Class mean quantity is ${meanQty.toFixed(1)} turns.`,
    lowEngagement,
    narrowStrategy,
    exemplars,
    hint: 'High quantity with low diversity usually means repeating Direct Solution Request. Metacognitive diversity is an exemplar even when the student talks less.',
  };
};

export const interpretClassDyadic = (analysis: HinaClassAnalysis): {
  summary: string;
  topEdges: HinaClassEdge[];
  hint: string;
} => {
  const significant = analysis.classEdges.filter((edge) => edge.significant);
  const topEdges = (significant.length > 0 ? significant : analysis.classEdges)
    .slice()
    .sort((a, b) => b.weight - a.weight || a.pValue - b.pValue)
    .slice(0, 8);

  if (!analysis.pruneReady) {
    return {
      summary: 'This class slice is too small for reliable dyadic pruning. Weighted student–code ties are listed, but significance filters stay off.',
      topEdges,
      hint: 'HINA dyadic analysis asks which student–code edges are unlikely under a null model. Short profiles cannot be pruned.',
    };
  }

  return {
    summary:
      significant.length > 0
        ? `${significant.length} student–code tie${significant.length === 1 ? '' : 's'} look systematic in this window.`
        : 'No edges cleared the significance filter; the class strategy mix may still be diffuse.',
    topEdges,
    hint: 'Stable Direct Solution Request ties flag answer-seeking. Stable Planning / Monitoring / Evaluation ties flag more reflective tutoring use.',
  };
};

export const interpretClassMesoscale = (analysis: HinaClassAnalysis): {
  summary: string;
  hint: string;
  designNote: string;
} => {
  const clusters = analysis.clusters;
  if (clusters.length <= 1) {
    return {
      summary: clusters[0]
        ? `Mesoscale view: ${clusters[0].label}. ${clusters[0].hint}`
        : 'Not enough students to infer strategy clusters.',
      hint: 'Mesoscale HINA groups learners who share similar code profiles. Teachers use these labels privately — do not show cluster names to students.',
      designNote:
        analysis.projection[0]
          ? `Strongest code co-occurrence: ${HINA_CODE_BY_ID[analysis.projection[0].source]?.shortLabel || analysis.projection[0].source} ↔ ${HINA_CODE_BY_ID[analysis.projection[0].target]?.shortLabel || analysis.projection[0].target}. Use projection links to rethink the tutor prompt or the task, not a single student.`
          : 'Projection links will appear once students share overlapping codes.',
    };
  }

  const labels = clusters.map((cluster) => `${cluster.label} (${cluster.studentIds.length})`).join(', ');
  return {
    summary: `Mesoscale clustering found ${clusters.length} strategy groups: ${labels}.`,
    hint: 'Each group shares a similar mix of HINA codes. Pair this with significant edges inside a group to see what defines the strategy.',
    designNote:
      analysis.overlay.requestProvidePairs > 0
        ? `${analysis.overlay.requestProvidePairs} request→provide loop${analysis.overlay.requestProvidePairs === 1 ? '' : 's'} appear in the transcripts — often a signal the tutor answers too quickly.`
        : 'Few immediate request→provide loops in this slice. Check the projection for missing Critical Assessment or Integration codes.',
  };
};

export const exportHinaClassCsv = (analysis: HinaClassAnalysis): string => {
  const headers = [
    'student_id',
    'student_name',
    'session_id',
    'session_title',
    'message_id',
    'speaker',
    'code',
    'dimension',
    'target',
    'excerpt',
    'stage',
    'ai_role',
  ];
  const rows = analysis.codedTurns.map((turn) => [
    turn.studentId,
    turn.studentName,
    turn.sessionId,
    turn.sessionTitle,
    turn.messageId,
    turn.actor === 'me' ? 'student' : 'ai',
    HINA_CODE_BY_ID[turn.codeId]?.label || turn.codeId,
    turn.dimension,
    turn.target,
    `"${(turn.excerpt || '').replace(/"/g, '""')}"`,
    turn.stage || '',
    turn.messageRole || '',
  ]);
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
};
