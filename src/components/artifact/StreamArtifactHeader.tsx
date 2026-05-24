import { useState, useCallback } from 'react';
import type { StreamArtifact } from '@/lib/artifact/types';
import { streamArtifactRegistry } from '@/lib/artifact/registry';

interface Props {
  artifact: StreamArtifact;
  onClose?: () => void;
}

export function StreamArtifactHeader({ artifact, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const entry = streamArtifactRegistry.get(artifact.type);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const handleDownload = useCallback(() => {
    const ext = streamArtifactRegistry.getFileExtension(artifact.type);
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{entry?.icon ?? '📄'}</span>
        <span className="text-sm font-medium truncate">
          {artifact.title}
        </span>
        {artifact.status === 'streaming' && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            生成中
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="复制内容"
        >
          {copied ? '✓' : '📋'}
        </button>
        <button
          onClick={handleDownload}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="下载文件"
        >
          ⬇️
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            title="关闭"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
