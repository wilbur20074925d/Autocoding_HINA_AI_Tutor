import { AI_TUTOR_SYSTEM_PROMPT } from '@hina/shared/aiTutorSystemPrompt';
import {
  LEARNING_MODE_SCREENSHOT_PREFIX,
  LEARNING_MODE_USER_SUFFIX,
} from '../shared/learningModePrompt';

const API_BASE = 'https://zenmux.ai/api/v1';
const MODEL = 'openai/gpt-4o';

export const TUTOR_SYSTEM_PROMPT = AI_TUTOR_SYSTEM_PROMPT;

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
      >;
    };

function apiKey(): string {
  return import.meta.env.VITE_ZENMUX_API_KEY || '';
}

export async function tutorComplete(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userTurn: { text?: string; imageDataUrl?: string }
): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error('Set VITE_ZENMUX_API_KEY in the project .env and rebuild the extension.');
  }

  const messages: ChatMessage[] = [{ role: 'system', content: TUTOR_SYSTEM_PROMPT }];

  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' } }
  > = [];

  let text = userTurn.text?.trim() || '';
  if (userTurn.imageDataUrl && !text) {
    text = LEARNING_MODE_SCREENSHOT_PREFIX;
  } else if (text) {
    text = `${text}${LEARNING_MODE_USER_SUFFIX}`;
  }
  if (text) parts.push({ type: 'text', text });
  if (userTurn.imageDataUrl) {
    parts.push({ type: 'image_url', image_url: { url: userTurn.imageDataUrl, detail: 'auto' } });
  }
  if (parts.length === 0) {
    throw new Error('Nothing to send to the tutor.');
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    messages.push({ role: 'user', content: parts[0].text });
  } else {
    messages.push({ role: 'user', content: parts });
  }

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.35,
      max_tokens: 520,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } })?.error?.message || response.statusText;
    throw new Error(`ZenMux (${response.status}): ${msg}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from tutor model.');
  return content;
}
