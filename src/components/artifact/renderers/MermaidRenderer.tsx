import { useEffect, useRef, useState } from 'react';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function MermaidRenderer({ artifact }: StreamArtifactRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (artifact.status !== 'complete') {
      setSvg('');
      setError(null);
      return;
    }

    let cancelled = false;

    async function renderMermaid() {
      try {
        const mermaid = await import('mermaid');
        if (cancelled) return;

        mermaid.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        });

        const id = `mermaid-${artifact.id.slice(0, 8)}`;
        const { svg: renderedSvg } = await mermaid.default.render(id, artifact.content);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '渲染失败');
          setSvg('');
        }
      }
    }

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [artifact.content, artifact.status, artifact.id]);

  if (artifact.status === 'streaming') {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400 text-sm">
        正在生成图表...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 dark:text-red-400 text-sm mb-2">
          Mermaid 渲染失败: {error}
        </div>
        <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto">
          {artifact.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full p-4 overflow-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
