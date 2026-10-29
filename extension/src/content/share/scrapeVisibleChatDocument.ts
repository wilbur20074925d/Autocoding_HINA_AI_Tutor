/**
 * Injected into the active tab via chrome.scripting.executeScript({ func }).
 * Must stay self-contained — Chrome serializes only this function body (no imports).
 */
export function scrapeVisibleChatDocument(): {
  ok: boolean;
  transcript?: string;
  turnCount?: number;
  error?: string;
  pageUrl?: string;
  debug?: { roleNodes: number; articles: number };
} {
  const OPTIMISTIC_RE = /write-only optimistic message/i;
  const SR_PREFIX_RE = /^(?:you|chatgpt|assistant|ai)\s+said\s*:?\s*/i;

  function stripSrPrefix(text: string): string {
    return text.replace(SR_PREFIX_RE, '').trim();
  }

  function messageText(el: Element): string {
    const markdown = el.querySelector('.markdown, [class*="markdown"], .prose');
    const raw = markdown ? markdown.textContent || '' : el.textContent || '';
    return stripSrPrefix(raw.replace(/\s+\n/g, '\n').trim());
  }

  function assistantLabel(): string {
    const host = location.hostname;
    if (/gemini\.google/i.test(host)) return 'Gemini';
    if (/claude\.ai/i.test(host)) return 'Claude';
    if (/copilot\.microsoft/i.test(host)) return 'Copilot';
    return 'ChatGPT';
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

  function queryAllDeep(root: Document | ShadowRoot | Element, selector: string): Element[] {
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

  function pushTurn(
    turns: Array<{ role: 'user' | 'assistant'; content: string }>,
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
  ].join(', ');

  function collectTurns(): Array<{ role: 'user' | 'assistant'; content: string }> {
    const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const seen = new Set<string>();

    queryAllDeep(document, MESSAGE_NODE_SELECTORS).forEach((node) => {
      const role = roleFromNode(node);
      if (!role) return;
      pushTurn(turns, seen, role, messageText(node));
    });

    if (turns.length === 0) {
      queryAllDeep(document, 'article').forEach((article) => {
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

    if (turns.length === 0 && /gemini\.google/i.test(location.hostname)) {
      queryAllDeep(document, '.query-content, .user-query').forEach((node) => {
        pushTurn(turns, seen, 'user', messageText(node));
      });
      queryAllDeep(document, '.model-response-text, message-content, .response-content').forEach((node) => {
        pushTurn(turns, seen, 'assistant', messageText(node));
      });
    }

    if (turns.length === 0 && /claude\.ai/i.test(location.hostname)) {
      queryAllDeep(document, '[data-is-user-message="true"]').forEach((node) => {
        pushTurn(turns, seen, 'user', messageText(node));
      });
      queryAllDeep(document, '[data-is-user-message="false"]').forEach((node) => {
        pushTurn(turns, seen, 'assistant', messageText(node));
      });
    }

    if (turns.length === 0 && /chatgpt\.com|chat\.openai\.com/i.test(location.hostname)) {
      const main = document.querySelector('main');
      const inner = (main?.innerText || document.body?.innerText || '').trim();
      const markerRe = /(?:^|\n\n)(You|ChatGPT)\s+said\s*:?\s*\n/gi;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let lastRole: 'user' | 'assistant' | null = null;
      while ((match = markerRe.exec(inner)) !== null) {
        if (lastRole !== null) {
          pushTurn(turns, seen, lastRole, inner.slice(lastIndex, match.index));
        }
        lastRole = /^you$/i.test(match[1].trim()) ? 'user' : 'assistant';
        lastIndex = markerRe.lastIndex;
      }
      if (lastRole !== null) {
        pushTurn(turns, seen, lastRole, inner.slice(lastIndex));
      }
    }

    return turns;
  }

  const mainEl = document.querySelector('main');
  const mainTextLength = (mainEl?.innerText || document.body?.innerText || '').trim().length;
  const roleNodeCount = queryAllDeep(document, '[data-message-author-role], [data-message-role]').length;
  const articleCount = queryAllDeep(document, 'article').length;
  const turns = collectTurns();

  if (turns.length === 0) {
    return {
      ok: false,
      error: 'No chat text found in the page DOM (including shadow roots).',
      pageUrl: location.href,
      debug: { roleNodes: roleNodeCount, articles: articleCount, mainTextLength },
    };
  }

  const label = assistantLabel();
  const transcript = turns
    .map((turn) => {
      const speaker = turn.role === 'user' ? 'You' : label;
      return `${speaker}\n\n${turn.content}`;
    })
    .join('\n\n---\n\n');

  return { ok: true, transcript, turnCount: turns.length, pageUrl: location.href };
}

/** @deprecated use scrapeVisibleChatDocument */
export const scrapeSharePageDocument = scrapeVisibleChatDocument;
