import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

const MAX_HTML_SIZE = 1024 * 1024; // 1MB

/** CSP injected into the iframe to restrict dangerous capabilities. */
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' 'self' https: http:; img-src data: blob: https: http:; connect-src 'none'; font-src https: http:; object-src 'none'; media-src 'none'; frame-src 'none';">`;

/**
 * Inject the CSP meta tag into the HTML document's <head>.
 * If no <head> is found, prepend it.
 */
function injectCsp(html: string): string {
  const headIdx = html.indexOf('<head');
  if (headIdx !== -1) {
    const insertAt = html.indexOf('>', headIdx) + 1;
    return html.slice(0, insertAt) + CSP_META + html.slice(insertAt);
  }
  // Fallback: prepend before everything
  return CSP_META + html;
}

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
      // Preserve the full document structure (<html>, <head>, <body>)
      // so that <style> and <link> in <head> are not discarded.
      WHOLE_DOCUMENT: true,
      ALLOWED_TAGS: [
        // Document structure
        'html', 'head', 'body', 'meta', 'title', 'link', 'style', 'base',
        // Block elements
        'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'br', 'hr', 'a', 'img', 'ul', 'ol', 'li', 'table',
        'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre',
        'code', 'strong', 'em', 'b', 'i', 'u', 's', 'strike',
        'sub', 'sup', 'mark', 'small', 'dl', 'dt', 'dd',
        'figure', 'figcaption', 'details', 'summary',
        'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
        'form', 'input', 'button', 'label', 'select', 'option', 'textarea',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'style',
        'target', 'rel', 'width', 'height', 'colspan', 'rowspan',
        'srcset', 'sizes', 'loading', 'name', 'type', 'value',
        'placeholder', 'charset', 'content', 'http-equiv', 'lang',
        'crossorigin', 'media', 'disabled',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // Inject CSP into the sanitized document's <head>
    return injectCsp(clean);
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
