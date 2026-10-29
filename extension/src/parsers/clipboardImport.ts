import type { ScrapePayload, ScrapedTurn } from '../shared/scrapeTypes';

const SHARE_URL_RE =
  /https?:\/\/(?:chat\.openai\.com|chatgpt\.com)\/share\/([a-f0-9-]{8,})/i;

const SHARE_URL_EXTRACT =
  /https?:\/\/(?:chat\.openai\.com|chatgpt\.com)\/share\/[a-f0-9-]+[^\s]*/i;

const ROLE_LINE_RES: Array<{ re: RegExp; role: 'user' | 'assistant' }> = [
  { re: /^(?:you|user|human|me|student)\s*[:\-]?\s*$/i, role: 'user' },
  { re: /^(?:chatgpt|assistant|ai|gpt(?:-[\d.]+)?|openai|gemini|claude|copilot)\s*[:\-]?\s*$/i, role: 'assistant' },
  { re: /^(?:you|user)\s+said\s*:?\s*$/i, role: 'user' },
  { re: /^(?:chatgpt|assistant|ai)\s+said\s*:?\s*$/i, role: 'assistant' },
];

function stableId(role: string, index: number, content: string): string {
  const head = content.slice(0, 80).replace(/\s+/g, ' ');
  return `${role}-${index}-${head.length}`;
}

function fingerprintTurns(turns: ScrapedTurn[]): string {
  return turns.map((t) => `${t.role}:${t.clientMessageId}:${t.content.length}`).join('|');
}

function buildPayload(
  platform: ScrapePayload['platform'],
  threadKey: string,
  turns: ScrapedTurn[],
  transcriptRaw: string,
  url: string
): ScrapePayload {
  return {
    platform,
    url,
    threadKey,
    transcriptRaw,
    turns,
    capturedAt: new Date().toISOString(),
    fingerprint: `${threadKey}|${fingerprintTurns(turns)}`,
  };
}

/** Parse copied conversation text (any platform) into turns. */
export function parseTranscriptText(raw: string): ScrapedTurn[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const markerSplit = splitByRoleMarkers(text);
  if (markerSplit.length >= 1) {
    return markerSplit.map((block, index) => ({
      clientMessageId: stableId(block.role, index, block.content),
      role: block.role,
      content: block.content,
      turnNumber: index + 1,
    }));
  }

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length >= 2) {
    let nextUser = true;
    const turns: ScrapedTurn[] = [];
    blocks.forEach((block, index) => {
      const inline = parseInlineRolePrefix(block);
      const role = inline?.role ?? (nextUser ? 'user' : 'assistant');
      const content = inline?.content ?? block;
      if (!content.trim()) return;
      turns.push({
        clientMessageId: stableId(role, index, content),
        role,
        content: content.trim(),
        turnNumber: turns.length + 1,
      });
      if (!inline) nextUser = role === 'assistant';
    });
    if (turns.length >= 1) return turns;
  }

  return [];
}

function parseInlineRolePrefix(block: string): { role: 'user' | 'assistant'; content: string } | null {
  const m = block.match(/^(You|User|ChatGPT|Assistant|AI|Gemini|Claude)\s*[:\-]\s*([\s\S]*)$/i);
  if (!m) return null;
  const label = m[1].toLowerCase();
  const role = /^(you|user)/.test(label) ? 'user' : 'assistant';
  return { role, content: m[2].trim() };
}

function splitByRoleMarkers(text: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const lines = text.split('\n');
  const blocks: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentRole && buffer.join('\n').trim()) {
      blocks.push({ role: currentRole, content: buffer.join('\n').trim() });
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    let matched: 'user' | 'assistant' | null = null;
    for (const { re, role } of ROLE_LINE_RES) {
      if (re.test(trimmed)) {
        matched = role;
        break;
      }
    }
    if (matched) {
      flush();
      currentRole = matched;
      continue;
    }
    if (currentRole) buffer.push(line);
  }
  flush();
  return blocks;
}

export function extractShareUrl(text: string): string | null {
  const match = text.trim().match(SHARE_URL_EXTRACT);
  return match ? match[0].replace(/[)\],.;]+$/, '') : null;
}

export function isShareLinkOnlyInput(text: string): boolean {
  const trimmed = text.trim();
  const url = extractShareUrl(trimmed);
  if (!url) return false;
  const rest = trimmed.replace(url, '').trim();
  return rest.length === 0;
}

export function shareIdFromUrl(url: string): string | null {
  const match = url.match(SHARE_URL_RE);
  return match?.[1] ?? null;
}

/** Resolve share link → labeled transcript (tab scrape first, then HTML fetch). */
export async function fetchChatGptShareTranscript(shareUrl: string): Promise<string> {
  const { importShareLinkViaTab } = await import('../services/shareLinkTabImport');
  try {
    return await importShareLinkViaTab(shareUrl);
  } catch (tabError) {
    console.warn('[HINA] Share tab scrape failed, trying fetch:', tabError);
  }

  return fetchChatGptShareTranscriptFromHtml(shareUrl);
}

/** Legacy fetch parse (SPA pages often empty). */
async function fetchChatGptShareTranscriptFromHtml(shareUrl: string): Promise<string> {
  const response = await fetch(shareUrl, {
    credentials: 'omit',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) {
    throw new Error(`Could not load share link (${response.status}). Copy the chat text instead.`);
  }
  const html = await response.text();

  const nextData = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextData?.[1]) {
    try {
      const json = JSON.parse(nextData[1]) as unknown;
      const extracted = extractMessagesFromJson(json);
      if (extracted) return extracted;
    } catch {
      /* fall through */
    }
  }

  const ldJson = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (ldJson) {
    for (const block of ldJson) {
      const inner = block.replace(/<\/?script[^>]*>/gi, '');
      try {
        const parsed = JSON.parse(inner) as unknown;
        const extracted = extractMessagesFromJson(parsed);
        if (extracted) return extracted;
      } catch {
        continue;
      }
    }
  }

  const roleChunks = html.match(/"role"\s*:\s*"(user|assistant)"[\s\S]*?"content"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
  if (roleChunks?.length) {
    const parts: string[] = [];
    for (const chunk of roleChunks) {
      const roleM = chunk.match(/"role"\s*:\s*"(user|assistant)"/);
      const contentM = chunk.match(/"content"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (!roleM || !contentM) continue;
      const label = roleM[1] === 'user' ? 'You' : 'ChatGPT';
      const content = JSON.parse(`"${contentM[1]}"`) as string;
      parts.push(`${label}\n\n${content}`);
    }
    if (parts.length) return parts.join('\n\n---\n\n');
  }

  throw new Error(
    'Share page did not expose parseable text. Open the share link, select all conversation text, copy, and paste here.'
  );
}

function extractMessagesFromJson(node: unknown, depth = 0): string | null {
  if (depth > 24 || node == null) return null;

  if (Array.isArray(node)) {
    if (node.length > 0 && typeof node[0] === 'object' && node[0] !== null) {
      const first = node[0] as Record<string, unknown>;
      if (first.role && first.content) {
        const parts: string[] = [];
        for (const item of node) {
          if (!item || typeof item !== 'object') continue;
          const row = item as Record<string, unknown>;
          const role = String(row.role || row.author || '');
          const content =
            typeof row.content === 'string'
              ? row.content
              : typeof row.text === 'string'
                ? row.text
                : extractTextFromParts(row.content ?? row.parts);
          if (!content?.trim()) continue;
          const label = /user|human/i.test(role) ? 'You' : 'ChatGPT';
          parts.push(`${label}\n\n${content.trim()}`);
        }
        if (parts.length) return parts.join('\n\n---\n\n');
      }
    }
    for (const item of node) {
      const found = extractMessagesFromJson(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of ['mapping', 'messages', 'conversation', 'linear_conversation', 'chat_messages']) {
      if (key in obj) {
        const found = extractMessagesFromJson(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const value of Object.values(obj)) {
      const found = extractMessagesFromJson(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function extractTextFromParts(parts: unknown): string {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text || '');
      return '';
    })
    .join('\n')
    .trim();
}

/** Transcript already read from the visible tab (no share fetch). */
export function buildPayloadFromVisibleTabTranscript(transcript: string, pageUrl: string): ScrapePayload {
  const turns = parseTranscriptText(transcript);
  if (turns.length === 0) {
    throw new Error('Could not parse visible tab text into user/assistant turns.');
  }
  const shareId = shareIdFromUrl(pageUrl);
  const threadKey = shareId || `tab-${hashString(pageUrl)}`;
  return buildPayload('active-tab', threadKey, turns, transcript, pageUrl);
}

/** Main entry: clipboard or pasted box content → ScrapePayload. */
export async function buildPayloadFromClipboardInput(input: string): Promise<ScrapePayload> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Nothing to import. Paste a share link or copied chat text.');
  }

  const shareUrl = extractShareUrl(trimmed);
  let transcript = trimmed;
  let threadKey = `clipboard-${hashString(trimmed.slice(0, 200))}`;
  let platform: ScrapePayload['platform'] = 'clipboard';
  let url = 'clipboard://manual';

  if (shareUrl && (isShareLinkOnlyInput(trimmed) || !trimmed.includes('\n'))) {
    const shareId = shareIdFromUrl(shareUrl);
    threadKey = shareId || threadKey;
    platform = 'chatgpt-share';
    url = shareUrl;
    transcript = await fetchChatGptShareTranscript(shareUrl);
  }

  const turns = parseTranscriptText(transcript);
  if (turns.length === 0) {
    throw new Error(
      'Could not split into user/assistant turns. Copy the full conversation (with You / ChatGPT labels) or paste a ChatGPT share link alone.'
    );
  }

  return buildPayload(platform, threadKey, turns, transcript, url);
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
