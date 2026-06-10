/**
 * Export utilities — Multi-format export for document processing results
 */

export type ExportFormat = 'txt' | 'markdown' | 'json';

interface ExportPayload {
  originalText: string;
  desensitizedText?: string;
  refinedText?: string;
  sensitiveMap?: Record<string, string>;
  sceneId?: string;
  aiInstruction?: string;
  createdAt?: string;
}

function generateMarkdown(payload: ExportPayload): string {
  const lines: string[] = [];
  lines.push('# 文档处理结果\n');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}\n`);

  if (payload.sceneId) {
    lines.push(`**场景**：${payload.sceneId}\n`);
  }

  if (payload.refinedText) {
    lines.push('## AI 优化结果\n');
    lines.push(payload.refinedText);
    lines.push('\n');
  }

  if (payload.desensitizedText && payload.desensitizedText !== payload.originalText) {
    lines.push('## 脱敏文本\n');
    lines.push(payload.desensitizedText);
    lines.push('\n');

    if (payload.sensitiveMap && Object.keys(payload.sensitiveMap).length > 0) {
      lines.push('### 敏感信息映射\n');
      lines.push('| 占位符 | 原始值 |');
      lines.push('|--------|--------|');
      for (const [placeholder, original] of Object.entries(payload.sensitiveMap)) {
        const typeMatch = placeholder.match(/__PII_(\w+)_\d+__/);
        const type = typeMatch ? typeMatch[1] : 'UNKNOWN';
        lines.push(`| \`${placeholder}\` | ${type}: ${original} |`);
      }
      lines.push('\n');
    }
  }

  lines.push('## 原始文本\n');
  lines.push(payload.originalText);

  return lines.join('\n');
}

function generateJSON(payload: ExportPayload): string {
  const data = {
    meta: {
      exportedAt: new Date().toISOString(),
      format: 'json',
      version: '1.0',
    },
    sceneId: payload.sceneId || null,
    aiInstruction: payload.aiInstruction || null,
    createdAt: payload.createdAt || null,
    content: {
      original: payload.originalText,
      desensitized: payload.desensitizedText || null,
      refined: payload.refinedText || null,
    },
    sensitiveInfo: payload.sensitiveMap
      ? Object.entries(payload.sensitiveMap).map(([placeholder, original]) => {
          const typeMatch = placeholder.match(/__PII_(\w+)_\d+__/);
          return {
            type: typeMatch ? typeMatch[1] : 'UNKNOWN',
            placeholder,
            original,
          };
        })
      : [],
  };
  return JSON.stringify(data, null, 2);
}

function generateTxt(payload: ExportPayload): string {
  const lines: string[] = [];
  lines.push('=== 文档处理结果 ===');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
  if (payload.sceneId) {
    lines.push(`场景：${payload.sceneId}`);
  }
  lines.push('');

  if (payload.refinedText) {
    lines.push('--- AI 优化结果 ---');
    lines.push(payload.refinedText);
    lines.push('');
  }

  if (payload.desensitizedText && payload.desensitizedText !== payload.originalText) {
    lines.push('--- 脱敏文本 ---');
    lines.push(payload.desensitizedText);
    lines.push('');
  }

  lines.push('--- 原始文本 ---');
  lines.push(payload.originalText);

  return lines.join('\n');
}

export function generateExportContent(format: ExportFormat, payload: ExportPayload): string {
  switch (format) {
    case 'markdown':
      return generateMarkdown(payload);
    case 'json':
      return generateJSON(payload);
    case 'txt':
    default:
      return generateTxt(payload);
  }
}

export function getExportMimeType(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'txt':
    default:
      return 'text/plain;charset=utf-8';
  }
}

export function getExportFileName(format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const ext = format === 'markdown' ? 'md' : format;
  return `document-${date}.${ext}`;
}

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
