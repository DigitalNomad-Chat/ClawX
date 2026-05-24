import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

const MAX_HTML_SIZE = 1024 * 1024; // 1MB

export function HtmlRenderer({
  artifact,
  viewMode = 'preview',
  onViewModeChange,
}: StreamArtifactRendererProps) {
  const [isOversized, setIsOversized] = useState(false);

  const sanitizedHtml = useMemo(() => {
    if (artifact.content.length > MAX_HTML_SIZE) {
      setIsOversized(true);
      return '';
    }
    setIsOversized(false);

    const clean = DOMPurify.sanitize(artifact.content, {
      ALLOWED_TAGS: [
        'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'br', 'hr', 'a', 'img', 'ul', 'ol', 'li', 'table',
        'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre',
        'code', 'strong', 'em', 'b', 'i', 'u', 's', 'strike',
        'sub', 'sup', 'mark', 'small', 'dl', 'dt', 'dd',
        'figure', 'figcaption', 'details', 'summary',
        'style', 'link',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'style',
        'target', 'rel', 'width', 'height', 'colspan', 'rowspan',
        'srcset', 'sizes', 'loading',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // 注入 CSP meta 标签
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' 'self'; img-src data: blob:; connect-src 'none'; font-src 'none'; object-src 'none'; media-src 'none'; frame-src 'none';">
${clean}`;
  }, [artifact.content]);

  if (isOversized) {
    return (
      <div className="p-4 text-amber-600 dark:text-amber-400">
        <p>HTML 内容超过 1MB，建议下载查看。</p>
        <button className="mt-2 text-sm underline">下载文件</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => onViewModeChange?.('preview')}
            className={`text-xs px-2 py-1 rounded ${viewMode === 'preview' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}
          >
            预览
          </button>
          <button
            onClick={() => onViewModeChange?.('source')}
            className={`text-xs px-2 py-1 rounded ${viewMode === 'source' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}
          >
            源码
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'preview' ? (
          <iframe
            sandbox="allow-scripts allow-popups"
            srcDoc={sanitizedHtml}
            className="w-full h-full border-0"
            title={artifact.title}
          />
        ) : (
          <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
