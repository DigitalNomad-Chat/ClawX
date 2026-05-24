import { useMemo } from 'react';
import { formatPlaceholderType } from '@/lib/desensitize';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePreviewProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
}

export function DesensitizePreview({ originalText, desensitizedText, sensitiveMap }: DesensitizePreviewProps) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(sensitiveMap)) {
      const match = key.match(/__PII_(\w+)_\d{8}__/);
      if (match) {
        const type = match[1];
        counts[type] = (counts[type] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([type, count]) => ({
      type,
      label: formatPlaceholderType(type),
      count,
    }));
  }, [sensitiveMap]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.map(({ type, label, count }) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-2xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
            >
              {label}: {count}处
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Original */}
        <div className="flex flex-col min-h-0">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5">原始内容</div>
          <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {originalText}
          </div>
        </div>

        {/* Desensitized */}
        <div className="flex flex-col min-h-0">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5">脱敏后</div>
          <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {desensitizedText.split(/(__PII_\w+_\d{8}__)/g).map((part, i) => {
              if (/__PII_\w+_\d{8}__/.test(part)) {
                return (
                  <span
                    key={i}
                    className="rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    title={sensitiveMap[part]}
                  >
                    {part}
                  </span>
                );
              }
              return part;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
