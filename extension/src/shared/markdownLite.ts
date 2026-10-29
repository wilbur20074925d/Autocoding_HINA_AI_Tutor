function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeTutorMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(#{1,6})([^\s#])/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
}

function renderCodeBlock(code: string, lang: string): string {
  const label = lang
    ? `<div class="md-code-hdr"><span class="code-lang">${escapeHtml(lang)}</span></div>`
    : '';
  return `<div class="md-code-block">${label}<pre class="md-pre"><code>${escapeHtml(code.trimEnd())}</code></pre></div>`;
}

function headingTag(level: number, inner: string): string {
  const n = Math.min(6, Math.max(1, level));
  return `<h${n} class="md-h md-h${n}">${inner}</h${n}>`;
}

function parseStepHeading(title: string): { stepNum: string; rest: string } | null {
  const m = title.match(/^step\s*0*(\d+)\b[.:)\-\s]*(.*)$/i);
  if (!m) return null;
  return { stepNum: m[1].padStart(2, '0'), rest: m[2].trim() };
}

function openStepRow(stepNum: string, rest: string): string {
  const intro = rest ? `<p class="md-p">${inlineFormat(rest)}</p>` : '';
  return `<div class="tutor-step-row"><span class="tutor-step-badge">Step ${stepNum}</span><div class="tutor-step-main">${intro}`;
}

/** Lightweight markdown for the in-page overlay (assistant replies). */
export function renderMarkdownLite(text: string): string {
  const normalized = normalizeTutorMarkdown(text);
  const parts = normalized.split(/(```[\s\S]*?```)/g);
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const nl = inner.indexOf('\n');
      if (nl === -1) {
        chunks.push(renderCodeBlock(inner, ''));
      } else {
        const first = inner.slice(0, nl).trim();
        const rest = inner.slice(nl + 1);
        const lang = /^[\w-+#]+$/.test(first) ? first : '';
        chunks.push(renderCodeBlock(lang ? rest : inner, lang));
      }
      continue;
    }

    const lines = part.split('\n');
    let html = '';
    let inUl = false;
    let inOl = false;
    let inStep = false;

    const closeStep = () => {
      if (inStep) {
        html += '</div></div>';
        inStep = false;
      }
    };

    const closeLists = () => {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
    };

    for (const line of lines) {
      const compact = line.trim();
      if (!compact) {
        closeLists();
        continue;
      }

      const plainStep = compact.match(/^step\s*0*(\d+)\b[.:)\-\s]+(.*)$/i);
      if (plainStep && !compact.startsWith('#')) {
        closeLists();
        closeStep();
        html += openStepRow(plainStep[1].padStart(2, '0'), plainStep[2].trim());
        inStep = true;
        continue;
      }

      const heading = compact.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeLists();
        const level = heading[1].length;
        const title = heading[2].trim();
        const step = parseStepHeading(title);
        if (step) {
          closeStep();
          html += openStepRow(step.stepNum, step.rest);
          inStep = true;
          continue;
        }
        closeStep();
        html += headingTag(level, inlineFormat(title));
        continue;
      }

      if (inStep && !/^[-*] /.test(compact) && !/^\d+\.\s+/.test(compact) && !/^>\s+/.test(compact)) {
        closeLists();
        html += `<p class="md-p">${inlineFormat(compact)}</p>`;
        continue;
      }

      if (/^[-*] /.test(compact)) {
        closeStep();
        closeLists();
        if (!inUl) {
          html += '<ul class="md-ul">';
          inUl = true;
        }
        html += `<li class="md-li">${inlineFormat(compact.slice(2))}</li>`;
        continue;
      }

      if (/^\d+\.\s+/.test(compact)) {
        closeStep();
        closeLists();
        if (!inOl) {
          html += '<ol class="md-ol">';
          inOl = true;
        }
        html += `<li class="md-li">${inlineFormat(compact.replace(/^\d+\.\s+/, ''))}</li>`;
        continue;
      }

      if (/^>\s+/.test(compact)) {
        closeStep();
        closeLists();
        html += `<blockquote class="md-quote">${inlineFormat(compact.slice(2))}</blockquote>`;
        continue;
      }

      if (/^---+$/.test(compact) || /^\*\*\*+$/.test(compact)) {
        closeLists();
        closeStep();
        html += '<hr class="md-hr"/>';
        continue;
      }

      closeStep();
      closeLists();
      html += `<p class="md-p">${inlineFormat(compact)}</p>`;
    }

    closeLists();
    closeStep();
    chunks.push(html);
  }

  return `<div class="markdown-content tutor-md">${chunks.join('')}</div>`;
}
