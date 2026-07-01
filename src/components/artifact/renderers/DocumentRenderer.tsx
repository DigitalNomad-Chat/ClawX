import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function DocumentRenderer({ artifact }: StreamArtifactRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none h-full p-4 overflow-auto">
      <ReactMarkdown
        remarkPlugins={[[remarkGfm], [remarkMath]]}
        rehypePlugins={[rehypeKatex]}
      >
        {artifact.content}
      </ReactMarkdown>
    </div>
  );
}
