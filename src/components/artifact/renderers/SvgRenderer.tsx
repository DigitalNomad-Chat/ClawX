import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function SvgRenderer({ artifact }: StreamArtifactRendererProps) {
  const sanitizedSvg = useMemo(() => {
    return DOMPurify.sanitize(artifact.content, {
      USE_PROFILES: { svg: true },
      ADD_TAGS: ['use', 'symbol'],
      ADD_ATTR: ['viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink'],
    });
  }, [artifact.content]);

  const svgMatch = artifact.content.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    // 回退到代码展示
    return (
      <pre className="p-4 text-sm font-mono whitespace-pre-wrap overflow-auto">
        <code>{artifact.content}</code>
      </pre>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 overflow-auto h-full">
      <div
        className="max-w-full"
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    </div>
  );
}
