import { useState, useCallback } from 'react';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function CodeRenderer({ artifact }: StreamArtifactRendererProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const language = (artifact.meta.language as string) || 'plaintext';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 uppercase">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-sm font-mono leading-relaxed">
          <code>{artifact.content}</code>
        </pre>
      </div>
    </div>
  );
}
