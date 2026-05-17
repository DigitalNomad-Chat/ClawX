/**
 * TokenTrendChart — Daily token usage bar chart (last 30 days)
 */
import { cn } from '@/lib/utils';
import type { TokenHistoryEntry } from '../store';

interface TokenTrendChartProps {
  data: TokenHistoryEntry[];
}

function formatLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TokenTrendChart({ data }: TokenTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
        暂无 Token 使用数据
      </div>
    );
  }

  // Only show days that have data at the edges; trim leading/trailing zeros
  let start = 0;
  while (start < data.length - 1 && data[start].totalTokens === 0) start++;
  let end = data.length - 1;
  while (end > start && data[end].totalTokens === 0) end--;
  const displayData = data.slice(start, end + 1);

  if (displayData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
        暂无 Token 使用数据
      </div>
    );
  }

  const maxTokens = Math.max(...displayData.map((d) => d.totalTokens), 1);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium mb-4">Token 使用趋势（最近 {data.length} 天）</h3>
      <div className="flex items-stretch gap-[2px] h-32">
        {displayData.map((entry, i) => {
          const heightPct = entry.totalTokens === 0 ? 0 : Math.max((entry.totalTokens / maxTokens) * 100, 4);
          return (
            <div
              key={entry.date}
              className="flex-1 flex flex-col items-center group"
            >
              <div className="w-full flex-1 relative flex items-end justify-center">
                {entry.totalTokens > 0 && (
                  <div
                    className={cn(
                      'w-full max-w-[12px] rounded-sm transition-all',
                      'bg-primary/60 group-hover:bg-primary'
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                )}
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow border whitespace-nowrap">
                    {formatLabel(entry.date)}: {entry.totalTokens.toLocaleString()} tokens
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatLabel(displayData[0].date)}</span>
        <span>{formatLabel(displayData[displayData.length - 1].date)}</span>
      </div>
    </div>
  );
}
