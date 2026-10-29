export type HinaDimension = 'cognitive' | 'metacognitive' | 'socio-emotional' | 'coordinative';
export type HinaActor = 'me' | 'ai';

export interface HinaCodeDef {
  id: string;
  label: string;
  shortLabel: string;
  dimension: HinaDimension;
  prompt: string;
  studentCue: string;
  aiCue: string;
  patterns: RegExp[];
}

export const HINA_DIMENSIONS: Array<{
  id: HinaDimension;
  label: string;
  question: string;
  color: string;
  fill: string;
}> = [
  {
    id: 'cognitive',
    label: 'Cognitive',
    question: 'Are you asking, requesting a solution, synthesizing, or critiquing?',
    color: '#0F172A',
    fill: 'rgba(15, 23, 42, 0.16)',
  },
  {
    id: 'metacognitive',
    label: 'Metacognitive',
    question: 'Is there planning, monitoring, or evaluation of the process?',
    color: '#334155',
    fill: 'rgba(51, 65, 85, 0.16)',
  },
  {
    id: 'socio-emotional',
    label: 'Socio-emotional',
    question: 'Is there greeting, thanks, agreement, or empathy?',
    color: '#64748B',
    fill: 'rgba(100, 116, 139, 0.18)',
  },
  {
    id: 'coordinative',
    label: 'Coordinative',
    question: 'Are you clarifying the task, coordinating work, or talking about resources?',
    color: '#94A3B8',
    fill: 'rgba(148, 163, 184, 0.22)',
  },
];

/** 19 interaction codes from the student HINA codebook (Me / AI × content codes). */
export const HINA_CODES: HinaCodeDef[] = [
  {
    id: 'direct-solution-request',
    label: 'Direct Solution Request',
    shortLabel: 'Solution request',
    dimension: 'cognitive',
    prompt: 'Directly asking for the final solution to a learning task.',
    studentCue: 'You asked for the finished answer.',
    aiCue: 'The tutor asked you to supply a finished answer — uncommon in 1:1 tutoring.',
    patterns: [
      /\b(give me|tell me|what is|what's|whats)\b.{0,40}\b(answer|solution|code|result)\b/i,
      /\b(solve|write|complete|do)\b.{0,30}\b(this|the|my|it|homework|assignment|code|function)\b/i,
      /\bjust (give|tell|write|show)\b/i,
      /\bfull (answer|solution|code)\b/i,
      /\bcan you (do|write|solve|finish)\b/i,
    ],
  },
  {
    id: 'extend-refine-request',
    label: 'Extend / Refine Request',
    shortLabel: 'Refine request',
    dimension: 'cognitive',
    prompt: 'Requesting to extend, modify, or refine existing content.',
    studentCue: 'You asked to change or improve what was already there.',
    aiCue: 'The tutor asked you to extend or refine the current work.',
    patterns: [
      /\b(extend|refine|modify|revise|improve|tweak|adjust|rewrite)\b/i,
      /\bmake (it|this|the) (better|cleaner|shorter|faster|more)\b/i,
      /\bcan you (change|update|edit|add to)\b/i,
      /\binstead of\b/i,
      /\badd (a |the )?(feature|check|case|comment)\b/i,
    ],
  },
  {
    id: 'information-idea-question',
    label: 'Information / Idea Question',
    shortLabel: 'Idea question',
    dimension: 'cognitive',
    prompt: 'Inquiring about relevant information or ideas related to problem-solving.',
    studentCue: 'You asked for information or an idea, not the finished solution.',
    aiCue: 'The tutor asked a question to surface information or ideas.',
    patterns: [
      /\bwhat (does|do|is|are)\b.{0,40}\b(mean|error|this|difference|idea)\b/i,
      /\bcan you (explain|clarify)\b/i,
      /\bhow (does|do|would|can)\b/i,
      /\bwhy (does|is|did|would)\b/i,
      /\bwhat'?s the difference\b/i,
      /\bi don'?t (get|understand)\b/i,
    ],
  },
  {
    id: 'direct-solution-provide',
    label: 'Direct Solution Provide',
    shortLabel: 'Solution provide',
    dimension: 'cognitive',
    prompt: 'Directly providing the final solution to a learning task.',
    studentCue: 'You supplied a finished solution.',
    aiCue: 'The tutor handed you a complete solution.',
    patterns: [
      /\bhere('s| is) (the|a) (complete |full )?(answer|solution|code|implementation)\b/i,
      /\bfinal (answer|solution|code)\b/i,
      /```[\s\S]{80,}/,
    ],
  },
  {
    id: 'idea-explanation-sharing',
    label: 'Idea / Explanation Sharing',
    shortLabel: 'Idea sharing',
    dimension: 'cognitive',
    prompt: 'Providing factual information, clarification, or explanation in response to a question.',
    studentCue: 'You explained an idea or clarified something.',
    aiCue: 'The tutor explained an idea rather than only delivering an answer.',
    patterns: [
      /\b(because|this means|in other words|for example|think of it as)\b/i,
      /\bthe (idea|reason|intuition) (is|here)\b/i,
      /\blet me explain\b/i,
      /\bhere is (how|why)\b/i,
    ],
  },
  {
    id: 'build-on-question',
    label: 'Build on Question',
    shortLabel: 'Build on',
    dimension: 'cognitive',
    prompt: "Following up on someone else's reply or idea.",
    studentCue: 'You followed up on the previous turn.',
    aiCue: 'The tutor built on what you just said.',
    patterns: [
      /\b(following up|building on|going back to|you mentioned|as you said)\b/i,
      /\b(also|and then),?\s+(can|could|what|how|why)\b/i,
      /\badding to (that|this|your)\b/i,
      /\brelated to (what|your) (you|the tutor) (said|asked)\b/i,
    ],
  },
  {
    id: 'critical-assessment',
    label: 'Critical Assessment',
    shortLabel: 'Critique',
    dimension: 'cognitive',
    prompt: 'Assessing or challenging an idea.',
    studentCue: 'You challenged or assessed an idea.',
    aiCue: 'The tutor assessed or challenged the work.',
    patterns: [
      /\b(wrong|incorrect|bug|doesn'?t work|contradict)\b/i,
      /\bthat (won'?t|will not|doesn'?t) (work|run|compile)\b/i,
      /\bi (disagree|think this is (flawed|off))\b/i,
      /\bthis (misses|overlooks|fails|is not quite)\b/i,
    ],
  },
  {
    id: 'integration-synthesis',
    label: 'Integration / Synthesis',
    shortLabel: 'Synthesis',
    dimension: 'cognitive',
    prompt: 'Connecting multiple ideas or pieces of information.',
    studentCue: 'You combined earlier ideas into one picture.',
    aiCue: 'The tutor pulled several ideas together.',
    patterns: [
      /\b(putting|put) (it|this) together\b/i,
      /\bin summary\b/i,
      /\bbased on (what|the|our|your)\b/i,
      /\bso overall\b/i,
      /\bcombining\b/i,
    ],
  },
  {
    id: 'extend-refine-solution',
    label: 'Extend / Refine Solution',
    shortLabel: 'Refine solution',
    dimension: 'cognitive',
    prompt: 'Modifying or adjusting an existing solution to enhance its precision, feasibility, or effectiveness.',
    studentCue: 'You adjusted an existing solution.',
    aiCue: 'The tutor refined or extended the current solution.',
    patterns: [
      /\b(here('s| is) (an? )?(updated|revised|refined|improved) (version|solution|code))\b/i,
      /\bi (adjusted|tweaked|refined|extended) (the|this)\b/i,
      /\ba more (precise|robust|efficient) (version|approach)\b/i,
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    shortLabel: 'Planning',
    dimension: 'metacognitive',
    prompt: 'Discussing goals, strategies, or a roadmap for completing the task.',
    studentCue: 'You planned how to approach the task.',
    aiCue: 'The tutor helped you plan the approach.',
    patterns: [
      /\b(plan|roadmap|strategy|first we|step by step|let'?s (start|begin) by)\b/i,
      /\bbefore (we|you|i) (code|write|solve)\b/i,
      /\bbreak (this|it) (down|into)\b/i,
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    shortLabel: 'Monitoring',
    dimension: 'metacognitive',
    prompt: 'Checking progress, identifying confusion, or recognizing a problem.',
    studentCue: 'You checked whether you were on track.',
    aiCue: 'The tutor checked your progress or confusion.',
    patterns: [
      /\b(stuck|confused|lost|on track|does this look right|am i)\b/i,
      /\bi think we('re| are) (off|lost)\b/i,
      /\bwait,? (that|this)\b/i,
      /\bstill (not|doesn'?t)\b/i,
    ],
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    shortLabel: 'Evaluation',
    dimension: 'metacognitive',
    prompt: "Looking back on what was learned or evaluating the group's process.",
    studentCue: 'You looked back on the work or judged the process.',
    aiCue: 'The tutor evaluated what was learned or how the process went.',
    patterns: [
      /\b(is this (correct|right|good enough)|how (good|solid) is)\b/i,
      /\bthis method (isn'?t|is not) (working|efficient)\b/i,
      /\bwe should (rethink|change (the )?approach)\b/i,
      /\bcheck (my|the) (work|answer|code)\b/i,
      /\b(i (learned|realise|realize)|next time|looking back|takeaway)\b/i,
    ],
  },
  {
    id: 'encouragement-greetings',
    label: 'Encouragement / Greetings',
    shortLabel: 'Greetings',
    dimension: 'socio-emotional',
    prompt: 'Providing greetings, positive feedback, approval, or motivation to peers.',
    studentCue: 'You greeted or encouraged.',
    aiCue: 'The tutor greeted or encouraged you.',
    patterns: [
      /^(hi|hey|hello|good (morning|afternoon|evening)|bye|goodbye)\b/i,
      /\b(you('ve| have) got this|nice work|well done|great (job|start|question)|keep going)\b/i,
    ],
  },
  {
    id: 'appreciation',
    label: 'Appreciation',
    shortLabel: 'Appreciation',
    dimension: 'socio-emotional',
    prompt: 'Expressing gratitude for help or contributions.',
    studentCue: 'You thanked the tutor.',
    aiCue: 'The tutor thanked you.',
    patterns: [/\b(thanks|thank you|thx|ty|grateful|appreciate)\b/i],
  },
  {
    id: 'empathy',
    label: 'Empathy',
    shortLabel: 'Empathy',
    dimension: 'socio-emotional',
    prompt: 'Acknowledging or sharing the feelings of others.',
    studentCue: 'You named how the work felt.',
    aiCue: 'The tutor acknowledged how this might feel.',
    patterns: [
      /\b(frustrating|stressed|anxious|overwhelmed|i feel|that'?s hard)\b/i,
      /\bit'?s (ok|okay|normal) to (feel|be)\b/i,
      /\bi (understand|hear) (that|you)\b/i,
    ],
  },
  {
    id: 'agreement-alignment',
    label: 'Agreement / Alignment',
    shortLabel: 'Agreement',
    dimension: 'socio-emotional',
    prompt: "Brief, affirmative responses that signal consensus, validation, or confirmation of others' comments.",
    studentCue: 'You agreed or confirmed.',
    aiCue: 'The tutor agreed with you.',
    patterns: [
      /^(yes|yeah|yep|ok|okay|sure|agree|got it|makes sense)[.!]?\s*$/i,
      /\b(i agree|that'?s right|exactly)\b/i,
    ],
  },
  {
    id: 'task-clarification',
    label: 'Task Clarification',
    shortLabel: 'Task clarify',
    dimension: 'coordinative',
    prompt: 'Understanding instructions, scope, and formal constraints.',
    studentCue: 'You clarified what the task is asking.',
    aiCue: 'The tutor clarified the task requirements.',
    patterns: [
      /\b(assignment|homework|word limit|due|requirements?|the (task|question) (asks|says))\b/i,
      /\bwhat (are we|am i) (supposed|expected) to\b/i,
      /\bis this (for|about) (the )?(lab|quiz|homework|assignment)\b/i,
      /\b(scope|constraint|instruction)\b/i,
    ],
  },
  {
    id: 'task-coordination',
    label: 'Task Coordination',
    shortLabel: 'Task coord.',
    dimension: 'coordinative',
    prompt: 'Delegating or accepting specific responsibilities.',
    studentCue: 'You organised who does which part.',
    aiCue: 'The tutor assigned or accepted a next step in the work.',
    patterns: [
      /\b(you (try|do|write|handle)|i'?ll (try|do|write|handle)|your turn|my turn)\b/i,
      /\blet'?s split\b/i,
      /\bcan you (take|handle) (this|the)\b/i,
      /\breply with\b/i,
      /\bin the (next|following) (message|step)\b/i,
    ],
  },
  {
    id: 'resource-coordination',
    label: 'Resource Coordination',
    shortLabel: 'Resources',
    dimension: 'coordinative',
    prompt: 'Discussing the use of tools, documents, or materials.',
    studentCue: 'You talked about a tool, file, or document.',
    aiCue: 'The tutor talked about a tool, document, or material.',
    patterns: [
      /\b(jupyter|notebook|colab|vscode|python|pandas|numpy|upload|file|library|package|install|document|material|dataset)\b/i,
      /\bhow (do i|to) (open|run|install|import|upload)\b/i,
    ],
  },
];

export const HINA_CODE_BY_ID = Object.fromEntries(HINA_CODES.map((code) => [code.id, code])) as Record<
  string,
  HinaCodeDef
>;

export const getDimensionMeta = (dimension: HinaDimension) =>
  HINA_DIMENSIONS.find((item) => item.id === dimension) ?? HINA_DIMENSIONS[0];

export const codesForDimension = (dimension: HinaDimension) =>
  HINA_CODES.filter((code) => code.dimension === dimension);
