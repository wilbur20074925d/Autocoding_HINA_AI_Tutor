import type { StudentStreamPage } from '../types/studentActionStream';
export { STUDENT_STREAM_PAGES } from '../types/studentActionStream';

export const IDLE_TIMEOUT_MS = 90_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const FLUSH_INTERVAL_MS = 3_000;
export const FLUSH_BATCH_SIZE = 50;
export const PREVIEW_CHARS = 200;
export const PAYLOAD_CHAR_THRESHOLD = 1000;

const VIEW_TO_STREAM_PAGE: Record<string, { parent: StudentStreamPage; sub: string }> = {
  exercises: { parent: 'coursework', sub: 'exercises' },
  'exercise-workspace': { parent: 'coursework', sub: 'exercise-workspace' },
  'exercise-detail': { parent: 'coursework', sub: 'exercise-detail' },
  'interactive-learning': { parent: 'coursework', sub: 'interactive-learning' },
  courses: { parent: 'coursework', sub: 'courses' },
  'course-detail': { parent: 'coursework', sub: 'course-detail' },
  modules: { parent: 'coursework', sub: 'modules' },
  'module-viewer': { parent: 'coursework', sub: 'module-viewer' },
  assignments: { parent: 'coursework', sub: 'assignments' },
  assignment: { parent: 'coursework', sub: 'assignment' },
  tasks: { parent: 'coursework', sub: 'tasks' },
  task: { parent: 'coursework', sub: 'task' },
  quizzes: { parent: 'coursework', sub: 'quizzes' },
  quiz: { parent: 'coursework', sub: 'quiz' },
  portfolio: { parent: 'coursework', sub: 'portfolio' },
  reflections: { parent: 'coursework', sub: 'reflections' },
  'reflection-form': { parent: 'coursework', sub: 'reflection-form' },
  'prompt-mastery': { parent: 'coursework', sub: 'prompt-mastery' },
  'learning-tools': { parent: 'coursework', sub: 'learning-tools' },
  'edu-ai-colab': { parent: 'coding-playground', sub: 'edu-ai-colab' },
  'coding-playground': { parent: 'coding-playground', sub: 'coding-playground' },
  playground: { parent: 'coding-playground', sub: 'playground' },
  'realtime-coder': { parent: 'coding-playground', sub: 'realtime-coder' },
  'notebook-preview': { parent: 'coding-playground', sub: 'notebook-preview' },
  'ai-test': { parent: 'ai-tutor', sub: 'ai-test' },
  'ai-tutor': { parent: 'ai-tutor', sub: 'ai-tutor' },
  'chat-report': { parent: 'ai-tutor', sub: 'chat-report' },
  'ai-chat': { parent: 'ai-tutor', sub: 'ai-chat' },
  chatbox: { parent: 'ai-tutor', sub: 'chatbox' },
  'group-project': { parent: 'collaboration', sub: 'group-project' },
  'group-project-collaboration': { parent: 'collaboration', sub: 'group-project-collaboration' },
  'collaboration-space': { parent: 'collaboration', sub: 'collaboration-space' },
  'collaboration-space-fullscreen': { parent: 'collaboration', sub: 'collaboration-space-fullscreen' },
  'realtime-fullscreen': { parent: 'collaboration', sub: 'realtime-fullscreen' },
  'collaborative-notebook': { parent: 'collaboration', sub: 'collaborative-notebook' },
  'collaborative-notebook-fullscreen': { parent: 'collaboration', sub: 'collaborative-notebook-fullscreen' },
  'collaborative-codebook': { parent: 'collaboration', sub: 'collaborative-codebook' },
  'video-collaboration': { parent: 'collaboration', sub: 'video-collaboration' },
  'video-collaboration-fullscreen': { parent: 'collaboration', sub: 'video-collaboration-fullscreen' },
  'consensus-canvas': { parent: 'innovation-space', sub: 'consensus-canvas' },
  'consensus-canvas-fullscreen': { parent: 'innovation-space', sub: 'consensus-canvas-fullscreen' },
  'gather-town': { parent: 'innovation-space', sub: 'gather-town' },
  'gather-town-fullscreen': { parent: 'innovation-space', sub: 'gather-town-fullscreen' },
  'reflective-echo-wall': { parent: 'innovation-space', sub: 'reflective-echo-wall' },
  'reflective-echo-wall-fullscreen': { parent: 'innovation-space', sub: 'reflective-echo-wall-fullscreen' },
  'working-progress': { parent: 'progress', sub: 'working-progress' },
  'progress-dashboard': { parent: 'progress', sub: 'progress-dashboard' },
  analytics: { parent: 'progress', sub: 'analytics' },
  'my-grades': { parent: 'progress', sub: 'my-grades' },
  ethics: { parent: 'ethics', sub: 'ethics' },
  'ethics-tracker': { parent: 'ethics', sub: 'ethics-tracker' },
  'ai-ethics': { parent: 'ethics', sub: 'ai-ethics' },
  mailbox: { parent: 'mailbox', sub: 'mailbox' },
  profile: { parent: 'profile', sub: 'profile' },
  settings: { parent: 'settings', sub: 'settings' },
  'action-log': { parent: 'staff', sub: 'action-log' },
  'student-activity': { parent: 'staff', sub: 'action-log' },
  'student-portfolios': { parent: 'staff', sub: 'student-portfolios' },
  'data-tracking': { parent: 'staff', sub: 'data-tracking' },
  'grades-management': { parent: 'staff', sub: 'grades-management' },
  'class-analytics': { parent: 'staff', sub: 'class-analytics' },
  'ai-tutor-sessions': { parent: 'ai-tutor', sub: 'ai-tutor-sessions' },
  'session-details': { parent: 'ai-tutor', sub: 'session-details' },
  'group-submissions-viewer': { parent: 'collaboration', sub: 'group-submissions-viewer' },
  'admin-console': { parent: 'staff', sub: 'admin-console' },
  'class-overview': { parent: 'staff', sub: 'class-overview' },
};

const PAGE_PATTERNS: Array<{ pattern: RegExp; parent: StudentStreamPage }> = [
  { pattern: /action-log|student-portfolios|data-tracking|grades-management|class-analytics|admin-console|class-overview/i, parent: 'staff' },
  { pattern: /course|assignment|exercise|module|task|quiz|portfolio|reflection|prompt-mastery|learning-tools/i, parent: 'coursework' },
  { pattern: /coding|playground|colab|notebook-preview|realtime-coder/i, parent: 'coding-playground' },
  { pattern: /ai-tutor|ai-test|chat-report|ai-chat|chatbox|tutor/i, parent: 'ai-tutor' },
  { pattern: /consensus|gather|reflective-echo|innovation|mindmap/i, parent: 'innovation-space' },
  { pattern: /group-project|collaboration|realtime-fullscreen|video-collaboration|collaborative-notebook/i, parent: 'collaboration' },
  { pattern: /progress|dashboard|grades|analytics|working-progress/i, parent: 'progress' },
  { pattern: /ethics/i, parent: 'ethics' },
  { pattern: /mailbox|mail/i, parent: 'mailbox' },
  { pattern: /profile/i, parent: 'profile' },
  { pattern: /settings/i, parent: 'settings' },
];

export const PARENT_PAGE_LABELS: Record<string, string> = {
  coursework: 'Coursework',
  'coding-playground': 'Coding Playground',
  'ai-tutor': 'AI Tutor',
  collaboration: 'Collaboration',
  'innovation-space': 'Innovation Space',
  progress: 'Progress',
  ethics: 'Ethics',
  mailbox: 'Mailbox',
  profile: 'Profile',
  settings: 'Settings',
  staff: 'Staff tools',
  other: 'Other',
};

export const ACTION_LABELS: Record<string, string> = {
  session_start: 'Started session',
  session_end: 'Ended session',
  page_enter: 'Opened page',
  page_leave: 'Left page',
  page_idle: 'Went idle',
  page_resume: 'Returned from idle',
  tab_hide: 'Switched away',
  tab_show: 'Tab visible',
  nav_click: 'Used navigation',
  ui_click: 'Clicked',
  panel_fold: 'Collapsed a section',
  panel_unfold: 'Expanded a section',
  modal_open: 'Opened a dialog',
  modal_close: 'Closed a dialog',
  tab_select: 'Switched tab',
  text_edit: 'Edited text',
  text_delete: 'Deleted text',
  download: 'Downloaded a file',
  upload: 'Uploaded a file',
  form_submit: 'Submitted a form',
  shortcut: 'Used a shortcut',
  assignment_view: 'Viewed assignment',
  assignment_edit: 'Edited assignment',
  assignment_submit: 'Submitted assignment',
  quiz_start: 'Started quiz',
  quiz_answer: 'Answered quiz question',
  quiz_submit: 'Submitted quiz',
  chat_open: 'Opened chat',
  message_send: 'Sent a message',
  cell_run: 'Ran a cell',
  code_run: 'Ran code',
};

export const INTERACTION_LABELS: Record<string, string> = {
  click: 'Click',
  dblclick: 'Double-click',
  rightclick: 'Right-click',
  keyboard: 'Keyboard',
  type: 'Typing',
  paste: 'Paste',
  cut: 'Cut',
  drag: 'Drag',
  drop: 'Drop',
  scroll: 'Scroll',
  touch: 'Touch',
  ai: 'AI',
  remote: 'Collaborator',
  system: 'System',
};

export function normalizeView(view?: string | null): string {
  if (!view) return '';
  return view.replace(/^\//, '').toLowerCase().trim();
}

export function getStreamPageContext(view?: string | null): {
  parent_page: StudentStreamPage;
  subpage: string;
  route: string;
} {
  const route = normalizeView(view) || 'unknown';
  const exact = VIEW_TO_STREAM_PAGE[route];
  if (exact) return { parent_page: exact.parent, subpage: exact.sub, route };

  const segment = route.split('/')[0] || route;
  const bySegment = VIEW_TO_STREAM_PAGE[segment];
  if (bySegment) return { parent_page: bySegment.parent, subpage: bySegment.sub, route };

  for (const { pattern, parent } of PAGE_PATTERNS) {
    if (pattern.test(route)) return { parent_page: parent, subpage: route, route };
  }

  return { parent_page: 'other', subpage: route, route };
}

export function parentPageLabel(page?: string | null): string {
  if (!page) return 'Unknown page';
  return PARENT_PAGE_LABELS[page] || page.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function actionLabel(action?: string | null): string {
  if (!action) return 'Action';
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function interactionLabel(interaction?: string | null): string {
  if (!interaction) return '';
  return INTERACTION_LABELS[interaction] || interaction;
}

export function previewText(value?: string | null, max = PREVIEW_CHARS): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function countCharDelta(before: string, after: string): { added: number; removed: number } {
  const added = Math.max(0, after.length - before.length);
  const removed = Math.max(0, before.length - after.length);
  return { added, removed };
}

export function isUuid(value?: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function formatDuration(totalSeconds?: number | null): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min ? `${hours}h ${min}m` : `${hours}h`;
}
