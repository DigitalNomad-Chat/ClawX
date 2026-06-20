import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { repairMarkdown } from '@/lib/markdown-repair';
import type { MessageBubbleProps } from './types';

/**
 * Normalize LaTeX delimiters so `remark-math` can detect them.
 */
function normalizeLatexDelimiters(input: string): string {
  if (!input || (input.indexOf('\\(') === -1 && input.indexOf('\\[') === -1)) {
    return input;
  }

  const parts = input.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith('```') || part.startsWith('`')) continue;
    let next = part.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`);
    next = next.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body}$`);
    parts[i] = next;
  }
  return parts.join('');
}

export function MessageBubble({
  text,
  isUser = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const debouncedText = useDebouncedValue(text, isStreaming ? 30 : 0);
  const displayText = isStreaming
    ? repairMarkdown(normalizeLatexDelimiters(debouncedText))
    : normalizeLatexDelimiters(text);

  if (isUser) {
    return (
      <div className="relative rounded-2xl bg-brand px-4 py-3 msg-bubble-user">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full msg-bubble-ai">
      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'html' }]]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !className;
              if (isInline) {
                return (
                  <code className="break-words" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code className={cn(className, 'text-sm font-mono leading-relaxed whitespace-pre-wrap break-words')} {...props}>
                  {children}
                </code>
              );
            },
            pre({ children, ...props }) {
              return (
                <pre
                  className="m-0 rounded-none bg-muted/30 dark:bg-white/5 px-4 py-3 overflow-x-auto whitespace-pre-wrap break-words"
                  {...props}
                >
                  {children}
                </pre>
              );
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-words">
                  {children}
                </a>
              );
            },
          }}
        >
          {displayText}
        </ReactMarkdown>
        {isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}
