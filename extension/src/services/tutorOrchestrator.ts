import { readContext } from '../lib/contextStorage';
import { getSupabase } from '../lib/supabase';
import type { TutorAskSource } from '../shared/tutorMessages';
import { cropDataUrl } from './screenshotCrop';
import { loadRecentThread, persistTutorExchange } from './tutorChatStore';
import { tutorComplete } from './zenmuxTutor';
import { BG_MESSAGE } from '../shared/scrapeTypes';
import { TUTOR_MSG } from '../shared/tutorMessages';
import { ensurePageAssist } from './pageAssistInject';

async function requireSession(): Promise<{ userId: string; chatSessionId: string }> {
  const ctx = await readContext();
  if (!ctx.classSessionId || !ctx.chatSessionId) {
    throw new Error('Select a class and chat session in the HINA side panel first.');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) {
    throw new Error('Sign in via the HINA side panel.');
  }

  return { userId: data.session.user.id, chatSessionId: ctx.chatSessionId };
}

function userLabel(source: TutorAskSource, text?: string, hasImage?: boolean): string {
  if (text?.trim()) return text.trim();
  if (hasImage) return '[Screenshot question — see attached image in tutor context]';
  return '(empty question)';
}

async function overlayTabMessage(tabId: number, payload: Record<string, unknown>): Promise<void> {
  await chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
}

export async function runTutorAsk(options: {
  source: TutorAskSource;
  text?: string;
  imageDataUrl?: string;
  tabId?: number;
  /** PDF viewer covers injected DOM. Callers show the reply window instead. */
  showOnPage?: boolean;
}): Promise<{ assistant: string; userEcho: string }> {
  const { userId, chatSessionId } = await requireSession();
  const history = await loadRecentThread(userId, chatSessionId);

  const userEcho = userLabel(options.source, options.text, Boolean(options.imageDataUrl));
  const hasImage = Boolean(options.imageDataUrl);
  const overlayUserContent = hasImage ? 'Screenshot question' : userEcho;
  const skipOverlayUser = options.source === 'overlay-followup';

  const tabId = options.tabId;
  const showOnPage = options.showOnPage !== false && tabId !== undefined;
  const thinkingLabel = hasImage ? 'Analyzing screenshot…' : 'AI Tutor is thinking…';

  if (showOnPage) {
    try {
      await ensurePageAssist(tabId);
      await overlayTabMessage(tabId, { type: TUTOR_MSG.SHOW_OVERLAY });
      if (!skipOverlayUser) {
        await overlayTabMessage(tabId, {
          type: TUTOR_MSG.OVERLAY_APPEND,
          messages: [
            {
              id: `u-${Date.now()}`,
              role: 'user',
              content: overlayUserContent,
              imageDataUrl: options.imageDataUrl,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      await overlayTabMessage(tabId, {
        type: TUTOR_MSG.OVERLAY_THINKING,
        active: true,
        label: thinkingLabel,
      });
    } catch {
      /* tab may not have content script */
    }
  }

  let assistant: string;
  try {
    assistant = await tutorComplete(history, {
      text: options.text,
      imageDataUrl: options.imageDataUrl,
    });
  } catch (error) {
    if (showOnPage) {
      try {
        await overlayTabMessage(tabId!, { type: TUTOR_MSG.OVERLAY_THINKING, active: false });
      } catch {
        /* ignore */
      }
    }
    throw error;
  }

  await persistTutorExchange(userId, chatSessionId, userEcho, assistant, options.source, {
    has_image: hasImage,
  });

  void chrome.runtime.sendMessage({ type: BG_MESSAGE.SYNC_STATUS });

  if (showOnPage) {
    try {
      await overlayTabMessage(tabId, { type: TUTOR_MSG.OVERLAY_THINKING, active: false });
      await overlayTabMessage(tabId, {
        type: TUTOR_MSG.OVERLAY_APPEND,
        messages: [
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: assistant,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      await overlayTabMessage(tabId, { type: TUTOR_MSG.OVERLAY_STATUS, status: null });
    } catch {
      /* tab may not have content script */
    }
  }

  return { assistant, userEcho };
}

export async function captureRegionAndAsk(
  tabId: number,
  rect: { x: number; y: number; width: number; height: number },
  devicePixelRatio: number
): Promise<{ assistant: string; userEcho: string }> {
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const cropped = await cropDataUrl(dataUrl, rect, devicePixelRatio);

  return runTutorAsk({
    source: 'screenshot-hotkey',
    text: '',
    imageDataUrl: cropped,
    tabId,
  });
}
