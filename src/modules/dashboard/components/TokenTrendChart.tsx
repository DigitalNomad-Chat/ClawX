/**
 * TokenTrendChart — Pure CSS bar chart for token usage over time
 */
import { cn } from '@/lib/utils';
import type { TokenHistoryEntry } from '../store';

interface TokenTrendChartProps {
  data: TokenHistoryEntry[];
}

function formatDate(ts: number): string {
  const d = new Date(ts);
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

  const maxTokens = Math.max(...data.map((d) => d.totalTokens), 1);
  const displayData = data.slice(-30); // last 30 entries

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium mb-4">Token 使用趋势（最近 {displayData.length} 条会话）</h3>
      <div className="flex items-end gap-1 h-32">
        {displayData.map((entry, i) => {
          const heightPct = Math.max((entry.totalTokens / maxTokens) * 100, 4);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end group"
              title={`${formatDate(entry.timestamp)}: ${entry.totalTokens.toLocaleString()} tokens`}
            >
              <div className="w-full relative flex justify-center">
                <div
                  className={cn(
                    'w-full max-w-[12px] rounded-sm transition-all',
                    'bg-primary/60 group-hover:bg-primary'
                  )}
                  style={{ height: `${heightPct}%` }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow border whitespace-nowrap">
                    {formatDate(entry.timestamp)}: {entry.totalTokens.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(displayData[0].timestamp)}</span>
        <span>{formatDate(displayData[displayData.length - 1].timestamp)}</span>
      </div>
    </div>
  );
}
