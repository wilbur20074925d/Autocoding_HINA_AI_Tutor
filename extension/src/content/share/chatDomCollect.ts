export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const OPTIMISTIC_RE = /write-only optimistic message/i;
const SR_PREFIX_RE = /^(?:you|chatgpt|assistant|ai)\s+said\s*:?\s*/i;

function stripSrPrefix(text: string): string {
  return text.replace(SR_PREFIX_RE, '').trim();
}

function messageText(el: Element): string {
  const markdown = el.querySelector('.markdown, [class*="markdown"], .prose');
  const raw = markdown ? markdown.textContent || '' : el.textContent || '';
  const normalized = raw.replace(/\s+\n/g, '\n').trim();
  return stripSrPrefix(normalized);
}

function roleFromNode(node: Element): 'user' | 'assistant' | null {
  const author = (node.getAttribute('data-message-author-role') || '').toLowerCase();
  if (author === 'user' || author === 'assistant') return author;

  const messageRole = (node.getAttribute('data-message-role') || '').toLowerCase();
  if (messageRole === 'user' || messageRole === 'assistant') return messageRole;

  const dataRole = (node.getAttribute('data-role') || '').toLowerCase();
  if (dataRole === 'user' || dataRole === 'assistant') return dataRole;

  const authorAlt = (node.getAttribute('data-message-author') || '').toLowerCase();
  if (authorAlt === 'user' || authorAlt === 'assistant') return authorAlt;

  const testId = node.getAttribute('data-testid') || '';
  if (/user|human/i.test(testId)) return 'user';
  if (/assistant|bot|gpt/i.test(testId)) return 'assistant';

  if (node.classList.contains('user-turn')) return 'user';
  if (node.classList.contains('agent-turn')) return 'assistant';

  return null;
}

function pushTurn(
  turns: ChatTurn[],
  seen: Set<string>,
  role: 'user' | 'assistant',
  content: string
) {
  const clean = stripSrPrefix(content.replace(/\s+\n/g, '\n').trim());
  if (!clean || clean.length < 1 || OPTIMISTIC_RE.test(clean)) return;
  const key = `${role}:${clean.slice(0, 120)}:${clean.length}`;
  if (seen.has(key)) return;
  seen.add(key);
  turns.push({ role, content: clean });
}

/** Walk document + open shadow roots (ChatGPT share often uses web components). */
export function queryAllDeep(root: Document | ShadowRoot | Element, selector: string): Element[] {
  const out: Element[] = [];
  const visit = (node: Document | ShadowRoot | Element) => {
    if (!('querySelectorAll' in node)) return;
    node.querySelectorAll(selector).forEach((el) => out.push(el));
    node.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) visit(el.shadowRoot);
    });
  };
  visit(root);
  return out;
}

const MESSAGE_NODE_SELECTORS = [
  '[data-message-author-role]',
  '[data-message-role]',
  '[data-role="user"]',
  '[data-role="assistant"]',
  '[data-message-author="user"]',
  '[data-message-author="assistant"]',
  '.user-turn',
  '.agent-turn',
  '[data-testid*="conversation-turn"]',
  'article[data-turn]',
  'section[data-turn]',
  '[data-turn-id-container]',
].join(', ');

function listDocuments(rootDoc: Document): Document[] {
  const docs: Document[] = [rootDoc];
  rootDoc.querySelectorAll('iframe').forEach((frame) => {
    try {
      if (frame.contentDocument) docs.push(frame.contentDocument);
    } catch {
      /* cross-origin */
    }
  });
  return docs;
}

function roleFromDataTurn(el: Element): 'user' | 'assistant' | null {
  const turn = (el.getAttribute('data-turn') || '').toLowerCase();
  if (turn === 'user' || turn === 'assistant') return turn;
  return null;
}

/** Parse visible text when structured nodes are unavailable (shadow / virtualization). */
export function parseChatGptInnerText(raw: string): ChatTurn[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text || text.length < 4) return [];

  const markerRe = /(?:^|\n\n)(You|ChatGPT)\s+said\s*:?\s*\n/gi;
  const turns: ChatTurn[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let lastRole: 'user' | 'assistant' | null = null;

  const pushBlock = (role: 'user' | 'assistant', content: string) => {
    const clean = stripSrPrefix(content.replace(/\s+\n/g, '\n').trim());
    if (clean.length >= 1) turns.push({ role, content: clean });
  };

  while ((match = markerRe.exec(text)) !== null) {
    if (lastRole !== null) {
      pushBlock(lastRole, text.slice(lastIndex, match.index));
    }
    lastRole = /^you$/i.test(match[1].trim()) ? 'user' : 'assistant';
    lastIndex = markerRe.lastIndex;
  }
  if (lastRole !== null) {
    pushBlock(lastRole, text.slice(lastIndex));
  }
  if (turns.length >= 1) return turns;

  const altSplit = text.split(/\n(?=(?:You|User|ChatGPT|Assistant)\n)/);
  if (altSplit.length >= 2) {
    for (let i = 0; i < altSplit.length; i += 1) {
      const block = altSplit[i].trim();
      const header = block.split('\n')[0]?.trim() || '';
      let role: 'user' | 'assistant' | null = null;
      if (/^(you|user)$/i.test(header)) role = 'user';
      else if (/^(chatgpt|assistant|ai)$/i.test(header)) role = 'assistant';
      if (!role) continue;
      const content = block.split('\n').slice(1).join('\n').trim();
      if (content) turns.push({ role, content });
    }
  }

  return turns;
}

export function collectChatTurnsFromDocument(doc: Document = document): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const seen = new Set<string>();

  for (const subDoc of listDocuments(doc)) {
    queryAllDeep(subDoc, 'article[data-turn], section[data-turn]').forEach((node) => {
      const role = roleFromDataTurn(node);
      if (!role) return;
      pushTurn(turns, seen, role, messageText(node));
    });
  }

  const nodes = listDocuments(doc).flatMap((subDoc) => queryAllDeep(subDoc, MESSAGE_NODE_SELECTORS));
  nodes.forEach((node) => {
    const role = roleFromNode(node);
    if (!role) return;
    pushTurn(turns, seen, role, messageText(node));
  });

  if (turns.length === 0) {
    queryAllDeep(doc, 'article').forEach((article) => {
      const roleNode =
        article.querySelector('[data-message-author-role]') ||
        article.querySelector('[data-message-role]') ||
        article.querySelector('[data-role]');
      let role: 'user' | 'assistant' | null = null;
      if (roleNode) role = roleFromNode(roleNode);
      if (!role) role = roleFromNode(article);
      if (!role) return;
      pushTurn(turns, seen, role, messageText(article));
    });
  }

  if (turns.length === 0 && /gemini\.google/i.test(doc.location.hostname)) {
    queryAllDeep(doc, '.query-content, .user-query').forEach((node) => {
      pushTurn(turns, seen, 'user', messageText(node));
    });
    queryAllDeep(doc, '.model-response-text, message-content, .response-content').forEach((node) => {
      pushTurn(turns, seen, 'assistant', messageText(node));
    });
  }

  if (turns.length === 0 && /claude\.ai/i.test(doc.location.hostname)) {
    queryAllDeep(doc, '[data-is-user-message="true"]').forEach((node) => {
      pushTurn(turns, seen, 'user', messageText(node));
    });
    queryAllDeep(doc, '[data-is-user-message="false"]').forEach((node) => {
      pushTurn(turns, seen, 'assistant', messageText(node));
    });
  }

  if (turns.length === 0 && /chatgpt\.com|chat\.openai\.com/i.test(doc.location.hostname)) {
    const main = doc.querySelector('main');
    const inner = (main?.innerText || doc.body?.innerText || '').trim();
    parseChatGptInnerText(inner).forEach((turn) => pushTurn(turns, seen, turn.role, turn.content));
  }

  return turns;
}

export function assistantLabelForHost(hostname: string): string {
  if (/gemini\.google/i.test(hostname)) return 'Gemini';
  if (/claude\.ai/i.test(hostname)) return 'Claude';
  if (/copilot\.microsoft/i.test(hostname)) return 'Copilot';
  return 'ChatGPT';
}

export function turnsToLabeledTranscript(turns: ChatTurn[], hostname: string = location.hostname): string {
  const label = assistantLabelForHost(hostname);
  return turns
    .map((turn) => {
      const speaker = turn.role === 'user' ? 'You' : label;
      return `${speaker}\n\n${turn.content}`;
    })
    .join('\n\n---\n\n');
}
