import type { ScrapePayload, ScrapedTurn } from '../../shared/scrapeTypes';

function extractThreadKey(url: string): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/c\/([a-f0-9-]+)/i);
    if (match?.[1]) return match[1];
    if (parsed.pathname === '/' || parsed.pathname === '') return 'home';
    return parsed.pathname.replace(/\//g, ':').slice(0, 120) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function messageText(el: Element): string {
  const markdown = el.querySelector('.markdown, [class*="markdown"], .prose');
  if (markdown) return (markdown.textContent || '').replace(/\s+\n/g, '\n').trim();
  return (el.textContent || '').replace(/\s+\n/g, '\n').trim();
}

function stableTurnId(role: string, index: number, content: string): string {
  const head = content.slice(0, 120);
  return `${role}-${index}-${head.length}-${head.replace(/\s+/g, ' ').slice(0, 40)}`;
}

function collectTurnsFromDataRoles(): ScrapedTurn[] {
  const nodes = document.querySelectorAll<HTMLElement>('[data-message-author-role]');
  const turns: ScrapedTurn[] = [];
  nodes.forEach((node, index) => {
    const roleAttr = (node.getAttribute('data-message-author-role') || '').toLowerCase();
    const role = roleAttr === 'user' ? 'user' : roleAttr === 'assistant' ? 'assistant' : null;
    if (!role) return;
    const content = messageText(node);
    if (!content) return;
    const domId = node.getAttribute('data-message-id') || node.id || stableTurnId(role, index, content);
    turns.push({
      clientMessageId: domId,
      role,
      content,
      turnNumber: turns.length + 1,
    });
  });
  return turns;
}

function collectTurnsFromArticles(): ScrapedTurn[] {
  const articles = document.querySelectorAll<HTMLElement>('article');
  const turns: ScrapedTurn[] = [];
  articles.forEach((article, index) => {
    const roleNode =
      article.querySelector('[data-message-author-role]') ||
      article.closest('[data-message-author-role]');
    let role: 'user' | 'assistant' | null = null;
    if (roleNode) {
      const r = (roleNode.getAttribute('data-message-author-role') || '').toLowerCase();
      role = r === 'user' ? 'user' : r === 'assistant' ? 'assistant' : null;
    }
    if (!role) {
      const testId = article.getAttribute('data-testid') || '';
      if (/user/i.test(testId)) role = 'user';
      else if (/assistant|bot/i.test(testId)) role = 'assistant';
    }
    if (!role) return;
    const content = messageText(article);
    if (!content || content.length < 2) return;
    turns.push({
      clientMessageId: article.getAttribute('data-message-id') || stableTurnId(role, index, content),
      role,
      content,
      turnNumber: turns.length + 1,
    });
  });
  return turns;
}

function fingerprintTurns(turns: ScrapedTurn[]): string {
  return turns.map((t) => `${t.role}:${t.clientMessageId}:${t.content.length}:${t.content.slice(0, 64)}`).join('|');
}

/** DOM scrape interface — call on ChatGPT conversation pages. */
export function scrapeChatGptDom(): ScrapePayload {
  const turnsPrimary = collectTurnsFromDataRoles();
  const turns = turnsPrimary.length >= 1 ? turnsPrimary : collectTurnsFromArticles();
  const transcriptRaw = turns.map((t) => `[${t.role.toUpperCase()}]\n${t.content}`).join('\n\n---\n\n');
  const url = location.href;
  const threadKey = extractThreadKey(url);

  return {
    platform: 'chatgpt',
    url,
    threadKey,
    transcriptRaw,
    turns,
    capturedAt: new Date().toISOString(),
    fingerprint: fingerprintTurns(turns),
  };
}
