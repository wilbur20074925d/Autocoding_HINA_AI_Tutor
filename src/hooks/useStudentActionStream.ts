import { useCallback, useEffect, useRef } from 'react';
import { StudentActionStreamService } from '../services/studentActionStreamService';
import type {
  DwellEndReason,
  DwellStartReason,
  StudentActionEvent,
  StudentInteraction,
  StudentPageDwell,
  TrackActionInput,
} from '../types/studentActionStream';
import {
  FLUSH_BATCH_SIZE,
  FLUSH_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  PAYLOAD_CHAR_THRESHOLD,
  PREVIEW_CHARS,
  countCharDelta,
  createClientId,
  getStreamPageContext,
  isUuid,
  previewText,
} from '../utils/studentActionCatalog';
import { getKeyCombination, isCommonShortcut } from '../utils/eventTracking';

const SESSION_STORAGE_KEY = 'sl_activity_session_id';
const FILE_HREF_RE = /\.(pdf|zip|csv|xlsx|xls|docx|doc|pptx|png|jpe?g|gif|webp|ipynb|json|txt|md)(\?|#|$)/i;
const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'summary',
  'label',
  'select',
  'option',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="link"]',
  '[data-action]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
].join(',');

type PresenceState = 'active' | 'idle';

interface UseStudentActionStreamOptions {
  studentId: string | null;
  actorRole?: string | null;
  enabled: boolean;
  currentView?: string;
  courseId?: string | null;
  courseCode?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = createClientId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return createClientId();
  }
}

function fieldValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden')) return '';
    return el.value || '';
  }
  if (el.isContentEditable) return el.innerText || '';
  return '';
}

function isSensitiveField(el: HTMLElement | null): boolean {
  if (!el) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || '').toLowerCase();
    if (['password', 'hidden', 'email', 'tel'].includes(type)) return true;
    if (el.autocomplete === 'current-password' || el.autocomplete === 'new-password') return true;
  }
  const name = `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''}`.toLowerCase();
  return /password|secret|token|otp/.test(name);
}

function closestInteractive(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
}

function elementLabel(el: HTMLElement | null): { id: string | null; label: string | null } {
  if (!el) return { id: null, label: null };
  const id =
    el.getAttribute('data-action') ||
    el.id ||
    el.getAttribute('name') ||
    el.getAttribute('href') ||
    `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').filter(Boolean)[0]}` : ''}`;

  const label =
    el.getAttribute('data-action') ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el instanceof HTMLInputElement ? el.value || el.name : null) ||
    el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ||
    el.tagName.toLowerCase();

  return { id: id || null, label: label || null };
}

function classifyClickAction(el: HTMLElement): string {
  const dataAction = (el.getAttribute('data-action') || '').toLowerCase();
  if (dataAction.includes('unfold') || dataAction.includes('expand')) return 'panel_unfold';
  if (dataAction.includes('fold') || dataAction.includes('collapse')) return 'panel_fold';
  if (dataAction.includes('tab')) return 'tab_select';
  if (dataAction.includes('modal') && dataAction.includes('close')) return 'modal_close';
  if (dataAction.includes('modal')) return 'modal_open';

  if (el.getAttribute('role') === 'tab') return 'tab_select';
  if (el.tagName === 'SUMMARY') {
    const details = el.closest('details');
    return details?.open ? 'panel_fold' : 'panel_unfold';
  }
  const expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true') return 'panel_fold';
  if (expanded === 'false') return 'panel_unfold';
  const closeLabel = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  if (el.closest('[role="dialog"], [role="alertdialog"]') && /close|dismiss/.test(closeLabel)) {
    return 'modal_close';
  }
  if (el.closest('nav, aside') && (el.tagName === 'BUTTON' || el.tagName === 'A')) return 'nav_click';
  return 'ui_click';
}

function looksLikeDownload(anchor: HTMLAnchorElement): boolean {
  if (anchor.hasAttribute('download')) return true;
  const href = anchor.getAttribute('href') || '';
  return FILE_HREF_RE.test(href);
}

function fileNameFromAnchor(anchor: HTMLAnchorElement): string {
  const download = anchor.getAttribute('download');
  if (download) return download;
  try {
    const href = anchor.href || anchor.getAttribute('href') || '';
    const path = href.split('?')[0];
    return decodeURIComponent(path.split('/').pop() || href);
  } catch {
    return anchor.getAttribute('href') || 'file';
  }
}

export function useStudentActionStream({
  studentId,
  actorRole = null,
  enabled,
  currentView,
  courseId,
  courseCode,
}: UseStudentActionStreamOptions) {
  const sessionIdRef = useRef<string>(readOrCreateSessionId());
  const queueRef = useRef<StudentActionEvent[]>([]);
  const dwellQueueRef = useRef<StudentPageDwell[]>([]);
  const dwellRef = useRef<StudentPageDwell | null>(null);
  const presenceRef = useRef<PresenceState>('active');
  const lastActivityRef = useRef<number>(Date.now());
  const lastIdleAtRef = useRef<number | null>(null);
  const lastViewRef = useRef<string>(currentView || '');
  const studentIdRef = useRef(studentId);
  const actorRoleRef = useRef(actorRole);
  const viewRef = useRef(currentView);
  const courseIdRef = useRef(courseId);
  const courseCodeRef = useRef(courseCode);
  const enabledRef = useRef(enabled);
  const flushingRef = useRef(false);
  const lastValuesRef = useRef<WeakMap<HTMLElement, string>>(new WeakMap());
  const pendingEditsRef = useRef<Map<string, { timer: number; input: TrackActionInput }>>(new Map());
  const tapeSeqRef = useRef(0);
  const sessionStartedRef = useRef(false);
  const sessionEndedRef = useRef(false);

  studentIdRef.current = studentId;
  actorRoleRef.current = actorRole;
  viewRef.current = currentView;
  courseIdRef.current = courseId;
  courseCodeRef.current = courseCode;
  enabledRef.current = enabled;

  const pageContext = useCallback(() => getStreamPageContext(viewRef.current), []);
  const courseUuid = useCallback(() => (isUuid(courseIdRef.current) ? courseIdRef.current : null), []);
  const actorMeta = useCallback(() => {
    const meta: Record<string, unknown> = {};
    if (actorRoleRef.current) meta.actor_role = actorRoleRef.current;
    if (courseCodeRef.current) meta.course_code = courseCodeRef.current;
    return meta;
  }, []);

  const enqueueDwell = useCallback((dwell: StudentPageDwell) => {
    const others = dwellQueueRef.current.filter((row) => row.id !== dwell.id);
    dwellQueueRef.current = [...others, { ...dwell }];
  }, []);

  const closeDwell = useCallback((reason: DwellEndReason) => {
    const dwell = dwellRef.current;
    if (!dwell || dwell.ended_at) return;
    const ended: StudentPageDwell = {
      ...dwell,
      ended_at: nowIso(),
      end_reason: reason,
      last_activity_at: new Date(lastActivityRef.current).toISOString(),
      last_heartbeat_at: nowIso(),
    };
    dwellRef.current = ended;
    enqueueDwell(ended);
    dwellRef.current = null;
  }, [enqueueDwell]);

  const openDwell = useCallback((reason: DwellStartReason) => {
    if (!enabledRef.current || !studentIdRef.current) return;
    if (dwellRef.current && !dwellRef.current.ended_at) return;
    const ctx = pageContext();
    const dwell: StudentPageDwell = {
      id: createClientId(),
      started_at: nowIso(),
      student_id: studentIdRef.current,
      session_id: sessionIdRef.current,
      course_id: courseUuid(),
      parent_page: ctx.parent_page,
      subpage: ctx.subpage,
      route: ctx.route,
      start_reason: reason,
      last_activity_at: nowIso(),
      last_heartbeat_at: nowIso(),
      metadata: actorMeta(),
    };
    dwellRef.current = dwell;
    presenceRef.current = 'active';
    enqueueDwell(dwell);
  }, [actorMeta, enqueueDwell, pageContext, courseUuid]);

  const flush = useCallback(async (opts?: { keepalive?: boolean }) => {
    if (flushingRef.current) return;
    const actions = queueRef.current;
    const dwells = dwellQueueRef.current;
    if (!actions.length && !dwells.length) return;
    if (!studentIdRef.current || !enabledRef.current) return;

    flushingRef.current = true;
    queueRef.current = [];
    dwellQueueRef.current = [];

    const ctx = pageContext();
    const yyyy = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    let tapePath: string | undefined;
    if (actions.length) {
      tapeSeqRef.current += 1;
      tapePath = `${studentIdRef.current}/${yyyy}/${sessionIdRef.current}/${tapeSeqRef.current}.jsonl`;
      const jsonl = actions.map((row) => JSON.stringify(row)).join('\n');
      const uploaded = await StudentActionStreamService.uploadJson(
        'activity-tapes',
        tapePath,
        jsonl,
        'application/x-ndjson'
      );
      if (uploaded.path) {
        actions.forEach((row) => {
          row.tape_path = uploaded.path;
        });
      }
    }

    const payload = {
      session: {
        id: sessionIdRef.current,
        student_id: studentIdRef.current,
        course_id: courseUuid(),
        started_at: actions[0]?.occurred_at,
        last_page: ctx.route,
        last_activity_at: nowIso(),
        device: {
          w: typeof window !== 'undefined' ? window.innerWidth : undefined,
          h: typeof window !== 'undefined' ? window.innerHeight : undefined,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          actor_role: actorRoleRef.current || undefined,
        },
      },
      actions,
      dwells,
    };

    const { error } = await StudentActionStreamService.ingest(payload);
    flushingRef.current = false;
    if (error) {
      queueRef.current = [...actions, ...queueRef.current];
      dwellQueueRef.current = [...dwells, ...dwellQueueRef.current];
    }

    if (opts?.keepalive) {
      // already sent via supabase fetch; nothing extra
    }
  }, [pageContext, courseUuid]);

  const track = useCallback(async (input: TrackActionInput) => {
    if (!enabledRef.current || !studentIdRef.current) return;

    const ctx = pageContext();
    const before = input.contentBefore ?? '';
    const after = input.contentAfter ?? '';
    const delta = countCharDelta(before, after);
    const charsAdded = input.charsAdded ?? delta.added;
    const charsRemoved = input.charsRemoved ?? delta.removed;
    const id = createClientId();
    const occurredAt = input.occurredAt || nowIso();

    let payloadPath: string | null = null;
    if (before.length > PAYLOAD_CHAR_THRESHOLD || after.length > PAYLOAD_CHAR_THRESHOLD) {
      const yyyy = occurredAt.slice(0, 10).replace(/-/g, '/');
      const path = `${studentIdRef.current}/${yyyy}/${id}.json`;
      const uploaded = await StudentActionStreamService.uploadJson(
        'activity-payloads',
        path,
        JSON.stringify({ before, after, action: input.action, target: input.targetLabel })
      );
      payloadPath = uploaded.path;
    }

    const event: StudentActionEvent = {
      id,
      occurred_at: occurredAt,
      student_id: studentIdRef.current,
      session_id: sessionIdRef.current,
      course_id: courseUuid(),
      parent_page: ctx.parent_page,
      subpage: ctx.subpage,
      route: ctx.route,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      target_id: input.targetId ?? null,
      target_label: previewText(input.targetLabel, 120),
      action: input.action,
      interaction: input.interaction ?? 'system',
      summary: previewText(input.summary, 400),
      content_preview: previewText(after || before, PREVIEW_CHARS),
      content_before_preview: previewText(before, PREVIEW_CHARS),
      chars_added: charsAdded,
      chars_removed: charsRemoved,
      payload_path: payloadPath,
      metadata: {
        ...actorMeta(),
        ...(input.metadata || {}),
      },
    };

    queueRef.current.push(event);
    if (queueRef.current.length >= FLUSH_BATCH_SIZE) {
      void flush();
    }
  }, [flush, pageContext, courseUuid]);

  const markActivity = useCallback((source: 'pointer' | 'keyboard' | 'scroll' | 'visible') => {
    if (!enabledRef.current || !studentIdRef.current) return;
    lastActivityRef.current = Date.now();
    if (presenceRef.current === 'idle') {
      presenceRef.current = 'active';
      const idleSeconds = lastIdleAtRef.current
        ? Math.max(0, Math.round((Date.now() - lastIdleAtRef.current) / 1000))
        : 0;
      lastIdleAtRef.current = null;
      openDwell(source === 'visible' ? 'visible_activity' : 'resume');
      void track({
        action: 'page_resume',
        interaction: source === 'keyboard' ? 'keyboard' : source === 'scroll' ? 'scroll' : 'click',
        summary: `Student returned and activity resumed after ${idleSeconds}s idle`,
        metadata: { source, idle_seconds: idleSeconds },
      });
    } else if (!dwellRef.current) {
      openDwell('enter');
    } else {
      dwellRef.current.last_activity_at = nowIso();
    }
  }, [openDwell, track]);

  const goIdle = useCallback((reason: DwellEndReason, actionName: string, summary: string) => {
    if (presenceRef.current === 'idle' && !dwellRef.current) return;
    presenceRef.current = 'idle';
    lastIdleAtRef.current = Date.now();
    const idleSeconds = reason === 'idle' ? Math.round(IDLE_TIMEOUT_MS / 1000) : 0;
    closeDwell(reason);
    void track({
      action: actionName,
      interaction: 'system',
      summary,
      metadata: { idle_ms: IDLE_TIMEOUT_MS, idle_seconds: idleSeconds, reason },
    });
  }, [closeDwell, track]);

  const queueTextEdit = useCallback((el: HTMLElement, interaction: StudentInteraction) => {
    if (isSensitiveField(el)) return;
    const after = fieldValue(el);
    const before = lastValuesRef.current.get(el) ?? after;
    lastValuesRef.current.set(el, after);
    if (before === after) return;

    const { id, label } = elementLabel(el);
    const key = id || label || 'field';
    const pending = pendingEditsRef.current.get(key);
    if (pending) window.clearTimeout(pending.timer);

    const delta = countCharDelta(before, after);
    const input: TrackActionInput = {
      action: delta.removed > delta.added ? 'text_delete' : 'text_edit',
      interaction,
      summary:
        delta.removed > delta.added
          ? `Deleted ${delta.removed} character${delta.removed === 1 ? '' : 's'} in ${label || 'a field'}`
          : `Wrote ${delta.added} character${delta.added === 1 ? '' : 's'} in ${label || 'a field'}`,
      targetId: id,
      targetLabel: label,
      contentBefore: pending?.input.contentBefore ?? before,
      contentAfter: after,
      charsAdded: (pending?.input.charsAdded || 0) + delta.added,
      charsRemoved: (pending?.input.charsRemoved || 0) + delta.removed,
    };

    const timer = window.setTimeout(() => {
      pendingEditsRef.current.delete(key);
      void track(input);
    }, 1500);
    pendingEditsRef.current.set(key, { timer, input });
  }, [track]);

  const flushPendingEdits = useCallback(() => {
    pendingEditsRef.current.forEach(({ timer, input }) => {
      window.clearTimeout(timer);
      void track(input);
    });
    pendingEditsRef.current.clear();
  }, [track]);

  // Session start / page enter / view changes
  useEffect(() => {
    if (!enabled || !studentId) return;

    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      void StudentActionStreamService.closeStaleDwells(studentId);
      void track({
        action: 'session_start',
        interaction: 'system',
        summary: 'Session started',
      });
      openDwell('enter');
      void track({
        action: 'page_enter',
        interaction: 'system',
        summary: `Opened ${pageContext().subpage}`,
      });
      lastViewRef.current = currentView || '';
    }
  }, [currentView, enabled, openDwell, pageContext, studentId, track]);

  useEffect(() => {
    if (!enabled || !studentId) return;
    const prev = lastViewRef.current;
    const next = currentView || '';
    if (prev === next) return;

    flushPendingEdits();
    if (prev) {
      void track({
        action: 'page_leave',
        interaction: 'system',
        summary: `Left ${getStreamPageContext(prev).subpage}`,
        metadata: { from: prev, to: next },
      });
      closeDwell('leave');
    }
    lastViewRef.current = next;
    presenceRef.current = 'active';
    lastActivityRef.current = Date.now();
    openDwell('enter');
    void track({
      action: 'page_enter',
      interaction: 'system',
      summary: `Opened ${getStreamPageContext(next).subpage}`,
      metadata: { from: prev, to: next },
    });
  }, [closeDwell, currentView, enabled, flushPendingEdits, openDwell, studentId, track]);

  // Idle + heartbeat
  useEffect(() => {
    if (!enabled || !studentId) return;

    const idleTimer = window.setInterval(() => {
      if (presenceRef.current !== 'active') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        goIdle('idle', 'page_idle', 'Stay time paused after 90 seconds without pointer, keyboard, or scroll activity');
      }
    }, 1000);

    const heartbeat = window.setInterval(() => {
      if (presenceRef.current !== 'active' || !dwellRef.current) return;
      dwellRef.current.last_heartbeat_at = nowIso();
      enqueueDwell(dwellRef.current);
      void flush();
    }, HEARTBEAT_INTERVAL_MS);

    const flushTimer = window.setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);

    return () => {
      window.clearInterval(idleTimer);
      window.clearInterval(heartbeat);
      window.clearInterval(flushTimer);
    };
  }, [enabled, enqueueDwell, flush, goIdle, studentId]);

  // Global capture
  useEffect(() => {
    if (!enabled || !studentId) return;

    let moveStamp = 0;
    const onPointerActivity = () => markActivity('pointer');
    const onMouseMove = () => {
      const now = Date.now();
      if (now - moveStamp < 250) return;
      moveStamp = now;
      markActivity('pointer');
    };
    const onScroll = () => markActivity('scroll');

    const onClick = (event: MouseEvent) => {
      markActivity('pointer');
      const el = closestInteractive(event.target);
      if (!el) return;
      if (el.closest('[data-activity-ignore="true"]')) return;

      const { id, label } = elementLabel(el);
      if (el instanceof HTMLAnchorElement && looksLikeDownload(el)) {
        const fileName = fileNameFromAnchor(el);
        void track({
          action: 'download',
          interaction: event.button === 2 ? 'rightclick' : 'click',
          summary: `Downloaded ${fileName}`,
          targetId: id,
          targetLabel: fileName,
          contentAfter: fileName,
          metadata: { href: el.getAttribute('href') },
        });
        return;
      }

      const action = classifyClickAction(el);

      void track({
        action,
        interaction: event.detail === 2 ? 'dblclick' : event.button === 2 ? 'rightclick' : 'click',
        summary: `Clicked ${label || el.tagName.toLowerCase()}`,
        targetId: id,
        targetLabel: label,
        metadata: { tag: el.tagName.toLowerCase() },
      });
    };

    const onContextMenu = (event: MouseEvent) => {
      const el = closestInteractive(event.target);
      if (!el) return;
      const { id, label } = elementLabel(el);
      void track({
        action: 'ui_click',
        interaction: 'rightclick',
        summary: `Right-clicked ${label || el.tagName.toLowerCase()}`,
        targetId: id,
        targetLabel: label,
      });
    };

    const onInput = (event: Event) => {
      markActivity('keyboard');
      const el = event.target;
      if (!(el instanceof HTMLElement)) return;
      if (el instanceof HTMLInputElement && el.type === 'file') {
        const files = Array.from(el.files || []);
        const names = files.map((file) => file.name);
        const bytes = files.reduce((sum, file) => sum + file.size, 0);
        void track({
          action: 'upload',
          interaction: 'click',
          summary: names.length ? `Uploaded ${names.join(', ')}` : 'Opened file picker',
          targetId: el.id || el.name,
          targetLabel: names.join(', ') || 'file input',
          contentAfter: names.join(', '),
          metadata: { count: names.length, bytes },
        });
        return;
      }
      queueTextEdit(el, 'type');
    };

    const onChange = (event: Event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement)) return;
      if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type))) {
        const { id, label } = elementLabel(el);
        const value = fieldValue(el);
        void track({
          action: 'ui_click',
          interaction: 'click',
          summary: `Changed ${label || 'control'} to ${previewText(value, 80) || 'a new value'}`,
          targetId: id,
          targetLabel: label,
          contentAfter: value,
        });
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      markActivity('keyboard');
      const el = event.target;
      if (!(el instanceof HTMLElement) || isSensitiveField(el)) return;
      const text = event.clipboardData?.getData('text') || '';
      const { id, label } = elementLabel(el);
      void track({
        action: 'text_edit',
        interaction: 'paste',
        summary: `Pasted ${text.length} character${text.length === 1 ? '' : 's'} into ${label || 'a field'}`,
        targetId: id,
        targetLabel: label,
        contentAfter: text,
        charsAdded: text.length,
      });
    };

    const onCut = (event: ClipboardEvent) => {
      markActivity('keyboard');
      const el = event.target;
      if (!(el instanceof HTMLElement) || isSensitiveField(el)) return;
      const selected = window.getSelection()?.toString() || fieldValue(el);
      const { id, label } = elementLabel(el);
      void track({
        action: 'text_delete',
        interaction: 'cut',
        summary: `Cut text from ${label || 'a field'}`,
        targetId: id,
        targetLabel: label,
        contentBefore: selected,
        charsRemoved: selected.length,
      });
    };

    const onSubmit = (event: Event) => {
      markActivity('pointer');
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const { id, label } = elementLabel(form);
      void track({
        action: 'form_submit',
        interaction: 'click',
        summary: `Submitted ${label || form.getAttribute('name') || 'a form'}`,
        targetId: id || form.getAttribute('name'),
        targetLabel: label || form.getAttribute('name') || 'form',
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      markActivity('keyboard');
      if (!isCommonShortcut(event) && !['Enter', 'Escape', 'Tab'].includes(event.key)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const { id, label } = elementLabel(target);
      void track({
        action: 'shortcut',
        interaction: 'keyboard',
        summary: `Pressed ${getKeyCombination(event)}`,
        targetId: id,
        targetLabel: label,
        metadata: { combo: getKeyCombination(event), key: event.key },
      });
    };

    const onBlurCapture = (event: FocusEvent) => {
      const el = event.target;
      if (el instanceof HTMLElement) {
        const pendingKey = elementLabel(el).id || elementLabel(el).label || 'field';
        const pending = pendingEditsRef.current.get(pendingKey);
        if (pending) {
          window.clearTimeout(pending.timer);
          pendingEditsRef.current.delete(pendingKey);
          void track(pending.input);
        }
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        goIdle('hidden', 'tab_hide', 'Stay time paused because the tab was hidden');
      } else {
        void track({
          action: 'tab_show',
          interaction: 'system',
          summary: 'Tab became visible; stay time waits for pointer or keyboard activity',
        });
      }
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mousedown', onPointerActivity, { passive: true });
    document.addEventListener('touchstart', onPointerActivity, { passive: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('wheel', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusout', onBlurCapture, true);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onPointerActivity);
      document.removeEventListener('touchstart', onPointerActivity);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusout', onBlurCapture, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, goIdle, markActivity, queueTextEdit, studentId, track]);

  // Unload
  useEffect(() => {
    if (!enabled || !studentId) return;

    const endSession = () => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;
      flushPendingEdits();
      closeDwell('session_end');
      queueRef.current.push({
        id: createClientId(),
        occurred_at: nowIso(),
        student_id: studentId,
        session_id: sessionIdRef.current,
        course_id: courseUuid(),
        parent_page: pageContext().parent_page,
        subpage: pageContext().subpage,
        route: pageContext().route,
        action: 'session_end',
        interaction: 'system',
        summary: 'Session ended',
        chars_added: 0,
        chars_removed: 0,
        metadata: actorMeta(),
      });
      void flush({ keepalive: true });
    };

    window.addEventListener('pagehide', endSession);
    window.addEventListener('beforeunload', endSession);
    return () => {
      window.removeEventListener('pagehide', endSession);
      window.removeEventListener('beforeunload', endSession);
      endSession();
    };
  }, [enabled, studentId]);

  return {
    track,
    flush,
    sessionId: sessionIdRef.current,
  };
}
