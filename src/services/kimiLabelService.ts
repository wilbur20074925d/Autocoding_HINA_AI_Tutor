/**
 * Kimi (Moonshot) API for HINA message labelling only — OpenAI-compatible chat completions.
 * @see https://platform.kimi.ai/docs/api/chat
 */

export const HINA_LABEL_SYSTEM_PROMPT =
  'You are a careful qualitative coder. Follow the closed HINA codebook exactly. Return valid JSON only. No markdown.';

const DEFAULT_API_BASE = 'https://api.moonshot.ai/v1';
/** Long codebook + up to 40 turns; override with VITE_KIMI_LABEL_MODEL / KIMI_LABEL_MODEL. */
const DEFAULT_LABEL_MODEL = 'moonshot-v1-32k';

function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_KIMI_API_BASE?.trim();
  return fromEnv || DEFAULT_API_BASE;
}

function resolveModel(): string {
  const fromEnv =
    import.meta.env.VITE_KIMI_LABEL_MODEL?.trim() ||
    import.meta.env.VITE_KIMI_MODEL?.trim();
  return fromEnv || DEFAULT_LABEL_MODEL;
}

export function getKimiLabelApiKey(): string {
  return import.meta.env.VITE_KIMI_API_KEY?.trim() || import.meta.env.VITE_MOONSHOT_API_KEY?.trim() || '';
}

export async function kimiLabelCompletion(userPrompt: string, apiKey?: string): Promise<string> {
  const key = apiKey?.trim() || getKimiLabelApiKey();
  if (!key) {
    throw new Error('Set KIMI_API_KEY or VITE_KIMI_API_KEY in .env for browser-side HINA labelling.');
  }

  const base = resolveApiBase().replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: resolveModel(),
      messages: [
        { role: 'system', content: HINA_LABEL_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Kimi API error ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Kimi API returned empty content');
  }
  return text;
}
