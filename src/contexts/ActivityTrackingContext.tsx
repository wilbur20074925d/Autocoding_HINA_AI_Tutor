import React, { createContext, useContext } from 'react';
import { useStudentActionStream } from '../hooks/useStudentActionStream';
import type { User } from '../lib/supabase';
import type { TrackActionInput } from '../types/studentActionStream';

interface ActivityTrackingContextType {
  track: (input: TrackActionInput) => Promise<void>;
  trackActivity: (
    activityType: string,
    activityCategory: string,
    actionDescription?: string,
    targetElement?: string,
    metadata?: Record<string, any>,
    ioType?: 'input' | 'output',
    parentPage?: string | null,
    subpage?: string | null,
    isFolded?: boolean
  ) => Promise<void>;
  trackInput: (opts?: { isFolded?: boolean; actionDescription?: string }) => Promise<void>;
  trackOutput: (opts?: { isFolded?: boolean; actionDescription?: string }) => Promise<void>;
  startComponentTracking: (
    componentType: string,
    componentId?: string,
    componentName?: string,
    metadata?: Record<string, any>
  ) => Promise<string | null>;
  endComponentTracking: (
    componentType: string,
    componentId?: string,
    interactionCount?: number,
    metadata?: Record<string, any>,
    inputCount?: number,
    outputCount?: number
  ) => Promise<void>;
  trackChatInteraction: (
    chatSessionId?: string,
    chatType?: string,
    metadata?: Record<string, any>
  ) => Promise<void>;
  trackGroupProjectActivity: (
    activityType: string,
    groupId?: string,
    projectId?: string,
    activityDescription?: string,
    timeSpentSeconds?: number,
    metadata?: Record<string, any>
  ) => Promise<void>;
  trackAssignmentActivity: (
    activityType: string,
    assignmentId?: string,
    editorType?: string,
    submissionStatus?: string,
    timeSpentSeconds?: number,
    metadata?: Record<string, any>
  ) => Promise<void>;
  trackQuizActivity: (
    activityType: string,
    quizId?: string,
    attemptNumber?: number,
    score?: number,
    timeSpentSeconds?: number,
    metadata?: Record<string, any>
  ) => Promise<void>;
  trackMouseAction: (
    actionType: 'click' | 'hover' | 'mousemove' | 'mousedown' | 'mouseup' | 'contextmenu' | 'doubleclick',
    event: MouseEvent
  ) => Promise<void>;
  trackKeyboardAction: (event: KeyboardEvent) => Promise<void>;
  startBlockTracking: (
    blockId: string,
    options?: {
      blockName?: string;
      blockType?: string;
      isFolded?: boolean;
    }
  ) => Promise<string | null>;
  endBlockTracking: (
    blockId: string,
    options?: {
      actionCount?: number;
      clickCount?: number;
      keyboardActionCount?: number;
      mouseActionCount?: number;
      inputCount?: number;
      outputCount?: number;
    }
  ) => Promise<void>;
  startSubpageTracking: (
    subpage: string,
    options?: {
      isFolded?: boolean;
    }
  ) => Promise<string | null>;
  endSubpageTracking: (
    subpage: string,
    options?: {
      actionCount?: number;
      clickCount?: number;
      keyboardActionCount?: number;
      mouseActionCount?: number;
      inputCount?: number;
      outputCount?: number;
      blockCount?: number;
    }
  ) => Promise<void>;
}

const noopAsync = async () => {};
const noopNull = async () => null;

const ActivityTrackingContext = createContext<ActivityTrackingContextType | null>(null);

export const ActivityTrackingProvider: React.FC<{
  children: React.ReactNode;
  currentUser: User | null;
  currentView?: string;
  selectedCourseId?: string | null;
  selectedCourseCode?: string | null;
}> = ({ children, currentUser, currentView, selectedCourseId, selectedCourseCode }) => {
  const { track } = useStudentActionStream({
    studentId: currentUser?.id || null,
    actorRole: currentUser?.role || null,
    enabled: Boolean(currentUser?.id),
    currentView,
    courseId: selectedCourseId,
    courseCode: selectedCourseCode,
  });

  const value: ActivityTrackingContextType = {
    track,
    trackActivity: async (activityType, activityCategory, actionDescription, targetElement, metadata) => {
      await track({
        action: activityType || 'ui_click',
        interaction: activityCategory === 'navigation' ? 'click' : 'system',
        summary: actionDescription,
        targetId: targetElement,
        targetLabel: targetElement,
        metadata: { activity_category: activityCategory, ...metadata },
      });
    },
    trackInput: async (opts) => {
      await track({
        action: 'text_edit',
        interaction: 'type',
        summary: opts?.actionDescription ?? 'User input',
        metadata: { isFolded: opts?.isFolded },
      });
    },
    trackOutput: async (opts) => {
      await track({
        action: 'ui_click',
        interaction: 'system',
        summary: opts?.actionDescription ?? 'System output',
        metadata: { isFolded: opts?.isFolded, io: 'output' },
      });
    },
    startComponentTracking: async (componentType, componentId, componentName, metadata) => {
      await track({
        action: 'page_enter',
        interaction: 'system',
        summary: `Focused ${componentName || componentType}`,
        entityType: componentType,
        entityId: componentId,
        targetLabel: componentName,
        metadata,
      });
      return componentId || componentType;
    },
    endComponentTracking: async (componentType, componentId, _interactionCount, metadata) => {
      await track({
        action: 'page_leave',
        interaction: 'system',
        summary: `Left ${componentType}`,
        entityType: componentType,
        entityId: componentId,
        metadata,
      });
    },
    trackChatInteraction: async (chatSessionId, chatType, metadata) => {
      await track({
        action: 'message_send',
        interaction: 'type',
        summary: `Sent a ${chatType || 'chat'} message`,
        entityType: 'chat',
        entityId: chatSessionId,
        metadata: { chat_type: chatType, ...metadata },
      });
    },
    trackGroupProjectActivity: async (activityType, groupId, projectId, activityDescription, timeSpentSeconds, metadata) => {
      await track({
        action: activityType || 'ui_click',
        interaction: 'click',
        summary: activityDescription || activityType,
        entityType: 'group_project',
        entityId: projectId || groupId,
        metadata: { group_id: groupId, project_id: projectId, time_spent_seconds: timeSpentSeconds, ...metadata },
      });
    },
    trackAssignmentActivity: async (activityType, assignmentId, editorType, submissionStatus, timeSpentSeconds, metadata) => {
      const action =
        activityType === 'submitted' || activityType === 'submit'
          ? 'assignment_submit'
          : activityType === 'viewed' || activityType === 'view'
            ? 'assignment_view'
            : 'assignment_edit';
      await track({
        action,
        interaction: action === 'assignment_edit' ? 'type' : 'click',
        summary: `Assignment ${activityType}${assignmentId ? `: ${assignmentId}` : ''}`,
        entityType: 'assignment',
        entityId: assignmentId,
        metadata: { editor_type: editorType, submission_status: submissionStatus, time_spent_seconds: timeSpentSeconds, ...metadata },
      });
    },
    trackQuizActivity: async (activityType, quizId, attemptNumber, score, timeSpentSeconds, metadata) => {
      const action =
        activityType === 'completed' || activityType === 'submit'
          ? 'quiz_submit'
          : activityType === 'started' || activityType === 'start'
            ? 'quiz_start'
            : 'quiz_answer';
      await track({
        action,
        interaction: 'click',
        summary: `Quiz ${activityType}`,
        entityType: 'quiz',
        entityId: quizId,
        metadata: { attempt_number: attemptNumber, score, time_spent_seconds: timeSpentSeconds, ...metadata },
      });
    },
    trackMouseAction: async (actionType, event) => {
      if (actionType !== 'click' && actionType !== 'doubleclick' && actionType !== 'contextmenu') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      await track({
        action: 'ui_click',
        interaction: actionType === 'doubleclick' ? 'dblclick' : actionType === 'contextmenu' ? 'rightclick' : 'click',
        summary: `Clicked ${target?.innerText?.slice(0, 60) || target?.tagName || 'element'}`,
        targetId: target?.id,
        targetLabel: target?.getAttribute('aria-label') || target?.innerText?.slice(0, 80),
      });
    },
    trackKeyboardAction: async (event) => {
      await track({
        action: 'shortcut',
        interaction: 'keyboard',
        summary: `Pressed ${event.key}`,
        metadata: { key: event.key, code: event.code },
      });
    },
    startBlockTracking: async (blockId, options) => {
      await track({
        action: 'page_enter',
        interaction: 'system',
        summary: `Entered ${options?.blockName || blockId}`,
        entityType: options?.blockType || 'block',
        entityId: blockId,
        targetLabel: options?.blockName,
      });
      return blockId;
    },
    endBlockTracking: async (blockId, options) => {
      await track({
        action: 'page_leave',
        interaction: 'system',
        summary: `Left block ${blockId}`,
        entityId: blockId,
        metadata: { ...options },
      });
    },
    startSubpageTracking: async (subpage) => {
      await track({
        action: 'page_enter',
        interaction: 'system',
        summary: `Opened ${subpage}`,
        metadata: { subpage },
      });
      return subpage;
    },
    endSubpageTracking: async (subpage) => {
      await track({
        action: 'page_leave',
        interaction: 'system',
        summary: `Left ${subpage}`,
        metadata: { subpage },
      });
    },
  };

  return (
    <ActivityTrackingContext.Provider value={value}>
      {children}
    </ActivityTrackingContext.Provider>
  );
};

export const useActivityTracking = () => {
  const context = useContext(ActivityTrackingContext);
  if (!context) {
    return {
      track: noopAsync,
      trackActivity: noopAsync,
      trackInput: noopAsync,
      trackOutput: noopAsync,
      startComponentTracking: noopNull,
      endComponentTracking: noopAsync,
      trackChatInteraction: noopAsync,
      trackGroupProjectActivity: noopAsync,
      trackAssignmentActivity: noopAsync,
      trackQuizActivity: noopAsync,
      trackMouseAction: noopAsync,
      trackKeyboardAction: noopAsync,
      startBlockTracking: noopNull,
      endBlockTracking: noopAsync,
      startSubpageTracking: noopNull,
      endSubpageTracking: noopAsync,
    };
  }
  return context;
};
