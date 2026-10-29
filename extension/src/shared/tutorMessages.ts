export const TUTOR_MSG = {
  /** Background → content: start drag-to-select region */
  START_REGION_CAPTURE: 'HINA_TUTOR_START_REGION_CAPTURE',
  /** Content → background: selected region (CSS viewport px) */
  REGION_SELECTED: 'HINA_TUTOR_REGION_SELECTED',
  REGION_CANCELLED: 'HINA_TUTOR_REGION_CANCELLED',
  /** Show / update floating tutor panel on page */
  SHOW_OVERLAY: 'HINA_TUTOR_SHOW_OVERLAY',
  OVERLAY_APPEND: 'HINA_TUTOR_OVERLAY_APPEND',
  OVERLAY_STATUS: 'HINA_TUTOR_OVERLAY_STATUS',
  /** Show or hide in-chat “AI Tutor is thinking…” placeholder */
  OVERLAY_THINKING: 'HINA_TUTOR_OVERLAY_THINKING',
  /** User follow-up from overlay */
  OVERLAY_USER_MESSAGE: 'HINA_TUTOR_OVERLAY_USER_MESSAGE',
  /** Side panel → background */
  ASK_TEXT: 'HINA_TUTOR_ASK_TEXT',
  ASK_CLIPBOARD: 'HINA_TUTOR_ASK_CLIPBOARD',
  /** Content script page hotkeys (works when Chrome command does not fire) */
  HOTKEY_ASK_CLIPBOARD: 'HINA_TUTOR_HOTKEY_ASK_CLIPBOARD',
  HOTKEY_CAPTURE_REGION: 'HINA_TUTOR_HOTKEY_CAPTURE_REGION',
  /** Side panel: run the same path as the keyboard shortcut */
  TEST_CLIPBOARD: 'HINA_TUTOR_TEST_CLIPBOARD',
  TEST_REGION: 'HINA_TUTOR_TEST_REGION',
  DIAGNOSE_TAB: 'HINA_TUTOR_DIAGNOSE_TAB',
  /** Content → background: this document can paint the floating panel */
  CAN_HOST_OVERLAY: 'HINA_TUTOR_CAN_HOST_OVERLAY',
  OVERLAY_VISIBLE: 'HINA_TUTOR_OVERLAY_VISIBLE',
  /** In-panel screenshot crop (PDF / pages where full-page drag fails) */
  OVERLAY_GET_SNAPSHOT: 'HINA_TUTOR_OVERLAY_GET_SNAPSHOT',
  OVERLAY_CROP_ASK: 'HINA_TUTOR_OVERLAY_CROP_ASK',
} as const;

export type TutorOverlayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Cropped screenshot shown in the chat bubble */
  imageDataUrl?: string;
};

export type TutorAskSource =
  | 'paste'
  | 'selection-hotkey'
  | 'clipboard-hotkey'
  | 'screenshot-hotkey'
  | 'overlay-followup';
