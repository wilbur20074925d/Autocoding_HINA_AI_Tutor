import { useState } from 'react';
import { Check, Copy, Reply } from 'lucide-react';
import { MarkdownRenderer } from '@hina/components/Common/MarkdownRenderer';
import { extractTrailingQuestion } from '../shared/tutorMessageUi';
import { TutorThinkingIndicator } from './TutorThinkingIndicator';

const HINA_ICON = chrome.runtime.getURL('hina-icon.png');

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/** Side panel bubbles aligned with web `AITestChatbox` TutorMessageBubble (compact). */
export function TutorMessageBubble({
  role,
  content,
  turnNumber,
  onReplyQuestion,
  pending,
  compact = true,
}: {
  role: 'user' | 'assistant';
  content: string;
  userName?: string;
  userAvatarUrl?: string | null;
  turnNumber?: number;
  onReplyQuestion?: (question: string) => void;
  pending?: 'thinking';
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const trailingQuestion =
    role === 'assistant' && !pending && onReplyQuestion ? extractTrailingQuestion(content) : null;

  if (role === 'assistant' && pending === 'thinking') {
    return <TutorThinkingIndicator compact={compact} />;
  }

  const handleCopy = async () => {
    try {
      await copyText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* user can select manually */
    }
  };

  if (role === 'user') {
    return (
      <div className="group flex animate-fade-in justify-end">
        <div className={`min-w-0 ${compact ? 'max-w-[88%]' : 'max-w-[min(85%,36rem)]'}`}>
          <div className="rounded-2xl rounded-br-md border border-slate-200 bg-slate-100 px-3.5 py-2.5 shadow-sm">
            <p className="select-text whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-slate-900">
              {content}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
            {turnNumber != null && <span>Turn {turnNumber}</span>}
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 focus:opacity-100"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-fade-in justify-start gap-2.5">
      <div
        className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} mt-0.5 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200`}
      >
        <img src={HINA_ICON} alt="AI Tutor" className="h-full w-full object-cover" />
      </div>
      <div className={`min-w-0 flex-1 ${compact ? 'max-w-[calc(100%-2.25rem)]' : 'max-w-[min(92%,46rem)]'}`}>
        <div className="max-w-full overflow-hidden rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
            <span className="text-[11px] font-semibold text-slate-800">AI Tutor</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title={copied ? 'Copied' : 'Copy reply'}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className={compact ? 'sr-only' : ''}>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="ext-tutor-bubble-body select-text px-3 py-2.5">
            <MarkdownRenderer content={content} variant="chat" className="ext-chat-markdown" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              {turnNumber != null && <span>Turn {turnNumber}</span>}
            </div>
            {trailingQuestion && onReplyQuestion && (
              <button
                type="button"
                onClick={() => onReplyQuestion(trailingQuestion)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                title="Put this question in the chat box"
              >
                <Reply className="h-3 w-3" />
                Answer this
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
