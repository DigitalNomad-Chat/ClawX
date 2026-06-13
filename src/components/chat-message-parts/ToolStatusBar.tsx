import { Loader2, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamingTool } from './types';
import { formatDuration } from './utils';

interface ToolStatusBarProps {
  tools: StreamingTool[];
}

export function ToolStatusBar({ tools }: ToolStatusBarProps) {
  return (
    <div className="w-full space-y-1">
      {tools.map((tool) => {
        const duration = formatDuration(tool.durationMs);
        const isRunning = tool.status === 'running';
        const isError = tool.status === 'error';
        return (
          <div
            key={tool.toolCallId || tool.id || tool.name}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
              isRunning && 'border-primary/30 bg-primary/5 text-foreground',
              !isRunning && !isError && 'border-border/50 bg-muted/20 text-muted-foreground',
              isError && 'border-destructive/30 bg-destructive/5 text-destructive',
            )}
          >
            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
            {!isRunning && !isError && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            {isError && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            <Wrench className="h-3 w-3 shrink-0 opacity-60" />
            <span className="font-mono text-xs font-medium">{tool.name}</span>
            {duration && <span className="text-tiny opacity-60">{tool.summary ? `(${duration})` : duration}</span>}
            {tool.summary && (
              <span className="truncate text-tiny opacity-70">{tool.summary}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
