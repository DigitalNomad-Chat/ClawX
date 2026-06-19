import { useState, useCallback } from 'react';
import { Copy, Check, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { repairMarkdown } from '@/lib/markdown-repair';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import type { StreamArtifactType } from '@/lib/artifact/types';
import type { MessageBubbleProps } from './types';

const PREVIEWABLE_LANG_MAP: Record<string, StreamArtifactType> = {
  html: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
};

function getPreviewableType(lang: string): StreamArtifactType | null {
  return PREVIEWABLE_LANG_MAP[lang.toLowerCase()] || null;
}

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

function CodeBlockToolbar({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const previewType = language ? getPreviewableType(language) : null;

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handlePreview = useCallback(() => {
    if (!previewType) return;
    const content = code.replace(/\n$/, '');
    const artifact = {
      id: crypto.randomUUID(),
      type: previewType,
      title: `${previewType.toUpperCase()} 预览`,
      content,
      status: 'complete' as const,
      meta: { language: language || undefined },
      position: { start: 0, end: content.length },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionKey: 'manual-preview',
    };
    useStreamArtifactStore.getState().addArtifact(artifact);
    useArtifactPanel.getState().openContent();
  }, [code, language, previewType]);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 dark:bg-white/5 rounded-t-lg border-b border-border/30">
      <span className="text-xs text-muted-foreground font-mono">{language || 'text'}</span>
      <div className="flex items-center gap-1">
        {previewType && (
          <button
            onClick={handlePreview}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 dark:hover:bg-white/10 rounded transition-colors"
            title="在面板中预览"
          >
            <Play className="h-3 w-3" />
            <span>预览</span>
          </button>
        )}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 dark:hover:bg-white/10 rounded transition-colors"
          title="复制"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
    </div>
  );
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
              const language = match?.[1];
              const isInline = !match && !className;
              if (isInline) {
                return (
                  <code className="break-all" {...props}>
                    {children}
                  </code>
                );
              }
              const codeText = String(children).replace(/\n$/, '');
              return (
                <div className="my-2 rounded-lg border border-border/30 overflow-hidden">
                  <CodeBlockToolbar code={codeText} language={language} />
                  <pre className="m-0 rounded-none bg-muted/30 dark:bg-white/5 px-4 py-3 overflow-x-auto">
                    <code className={cn(className, 'text-sm font-mono leading-relaxed')} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
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
