import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy } from 'lucide-react';
import 'katex/dist/katex.min.css';

export type MarkdownVariant = 'default' | 'chat' | 'light';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  variant?: MarkdownVariant;
}

const extractTextFromReactNode = (node: any): string => {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join('');
  if (React.isValidElement(node)) return extractTextFromReactNode((node as any).props?.children);
  return '';
};

const copyToClipboard = async (text: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const selectableStyle: React.CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
};

const MarkdownCodeBlock: React.FC<{
  children: React.ReactNode;
  variant: MarkdownVariant;
  [key: string]: any;
}> = ({ children, variant, ...props }) => {
  let language = '';
  if (React.isValidElement(children) && (children as any).props?.className) {
    const match = /language-(\w+)/.exec((children as any).props.className || '');
    language = match ? match[1] : '';
  }

  const codeText = extractTextFromReactNode(children);
  const [copied, setCopied] = useState(false);
  const isChat = variant === 'chat';
  const isLight = variant === 'light';

  const onCopy = async () => {
    try {
      await copyToClipboard(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // If clipboard fails (permissions), the user can still select and copy.
    }
  };

  const handleCopyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selectionText = typeof window !== 'undefined' ? window.getSelection()?.toString() || '' : '';
    if (selectionText.trim().length > 0) return;
    void onCopy();
  };

  if (isLight) {
    return (
      <div className="group my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {language || 'code'}
          </span>
          <button
            type="button"
            onClick={handleCopyClick}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
            aria-label="Copy code"
            title={copied ? 'Copied!' : 'Copy code'}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre
          className="max-w-full overflow-x-auto whitespace-pre bg-white px-4 py-3 text-[13px] leading-relaxed text-slate-800 select-text cursor-text"
          style={selectableStyle}
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  }

  if (isChat) {
    return (
      <div className="group my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 bg-slate-800 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {language || 'code'}
          </span>
          <button
            type="button"
            onClick={handleCopyClick}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            aria-label="Copy code"
            title={copied ? 'Copied!' : 'Copy code'}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre
          className="max-w-full overflow-x-auto whitespace-pre px-4 py-3 text-[13px] leading-relaxed text-slate-100 select-text cursor-text"
          style={selectableStyle}
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 relative w-full max-w-full group">
      {language && (
        <div className="absolute top-2 left-3 text-xs text-gray-400 font-mono uppercase tracking-wide select-none pointer-events-none">
          {language}
        </div>
      )}
      <button
        type="button"
        onClick={handleCopyClick}
        onMouseDown={(e) => e.preventDefault()}
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md text-xs border border-gray-700 bg-gray-800/80 text-gray-100 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 select-none pointer-events-none group-hover:pointer-events-auto"
        aria-label="Copy code"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? 'Copied' : 'Copy code'}
      </button>

      <pre
        className="bg-gray-900 text-gray-100 px-4 pb-4 pt-9 rounded-lg overflow-x-auto border border-gray-700 max-w-full whitespace-pre select-text cursor-text"
        style={selectableStyle}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
};

const createMarkdownComponents = (variant: MarkdownVariant) => {
  const isChat = variant === 'chat' || variant === 'light';

  return {
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (inline) {
        return (
          <code
            className={
              isChat
                ? 'rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[13px] font-mono text-slate-800 break-words select-text'
                : 'bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono border border-gray-200 break-words select-text'
            }
            style={selectableStyle}
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <code
          className={`text-sm font-mono whitespace-pre select-text ${className || ''}`}
          style={selectableStyle}
          data-language={language}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: (props: any) => <MarkdownCodeBlock variant={variant} {...props} />,
    h1: ({ children }: any) => (
      <h1 className={isChat
        ? 'mt-4 mb-2 first:mt-0 text-base font-semibold tracking-tight text-slate-900 break-words'
        : 'text-2xl font-bold mt-4 mb-2 text-gray-900 break-words'
      }>
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className={isChat
        ? 'mt-4 mb-2 first:mt-0 border-b border-slate-100 pb-1.5 text-[15px] font-semibold tracking-tight text-slate-900 break-words'
        : 'text-xl font-bold mt-4 mb-2 text-gray-900 break-words'
      }>
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className={isChat
        ? 'mt-3 mb-1.5 first:mt-0 text-sm font-semibold text-slate-800 break-words'
        : 'text-lg font-semibold mt-3 mb-2 text-gray-900 break-words'
      }>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: any) => {
      const childrenArray = React.Children.toArray(children);
      const hasOnlyCodeBlocks = childrenArray.length > 0 && childrenArray.every((child: any) => {
        if (React.isValidElement(child)) {
          const childType = child.type;
          if (childType === 'pre' || childType === MarkdownCodeBlock || (childType === 'div' && (child as any).props?.children)) {
            return true;
          }
          if (childType === 'code' && (child as any).props?.className && !(child as any).props?.className.includes('inline')) {
            return true;
          }
        }
        return false;
      });

      if (hasOnlyCodeBlocks) {
        return <>{children}</>;
      }

      return (
        <p
          className={isChat
            ? 'mb-2.5 last:mb-0 text-[15px] leading-[1.65] text-slate-700 break-words'
            : 'mb-4 leading-relaxed text-gray-800 break-words'
          }
          style={selectableStyle}
          {...props}
        >
          {children}
        </p>
      );
    },
    ul: ({ children }: any) => (
      <ul className={isChat
        ? 'mb-2.5 list-disc list-outside space-y-1.5 pl-5 break-words text-slate-700'
        : 'list-disc list-outside mb-4 space-y-2 pl-6 break-words'
      }>
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className={isChat
        ? 'mb-2.5 list-decimal list-outside space-y-1.5 pl-5 break-words text-slate-700'
        : 'list-decimal list-outside mb-4 space-y-2 pl-6 break-words'
      }>
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className={isChat ? 'text-[15px] leading-relaxed text-slate-700 break-words' : 'text-gray-800 break-words'}>
        {children}
      </li>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className={isChat
        ? 'my-2.5 rounded-r-lg border-l-[3px] border-slate-300 bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700'
        : 'border-l-4 border-blue-500 pl-4 py-2 my-2 bg-blue-50 text-gray-800 italic'
      }>
        {children}
      </blockquote>
    ),
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={isChat
          ? 'font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-950 hover:decoration-slate-500'
          : 'text-blue-600 hover:text-blue-800 underline'
        }
      >
        {children}
      </a>
    ),
    strong: ({ children }: any) => (
      <strong className={isChat ? 'font-semibold text-slate-900' : 'font-bold text-gray-900'}>{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className={isChat ? 'italic text-slate-600' : 'italic text-gray-700'}>{children}</em>
    ),
    hr: () => <hr className={isChat ? 'my-3 border-t border-slate-200' : 'my-4 border-t border-gray-300'} />,
    table: ({ children }: any) => (
      <div className={isChat ? 'my-3 overflow-x-auto rounded-lg border border-slate-200' : 'overflow-x-auto my-3'}>
        <table className={isChat ? 'min-w-full border-collapse text-sm' : 'min-w-full border-collapse border border-gray-300'}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className={isChat ? 'bg-slate-50' : 'bg-gray-100'}>{children}</thead>
    ),
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => (
      <tr className={isChat ? 'border-b border-slate-200 last:border-0' : 'border-b border-gray-300'}>{children}</tr>
    ),
    th: ({ children }: any) => (
      <th className={isChat
        ? 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600'
        : 'border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900'
      }>
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className={isChat ? 'px-3 py-2 text-[13px] text-slate-700' : 'border border-gray-300 px-4 py-2 text-gray-800'}>
        {children}
      </td>
    ),
  };
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(function MarkdownRenderer({
  content,
  className = '',
  variant = 'default',
}) {
  const components = React.useMemo(() => createMarkdownComponents(variant), [variant]);

  return (
    <div
      className={`markdown-content break-words max-w-full select-text cursor-text ${className}`}
      style={selectableStyle}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
