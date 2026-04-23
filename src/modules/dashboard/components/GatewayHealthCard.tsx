/**
 * GatewayHealthCard — Shows Gateway status with color-coded state
 */
import { cn } from '@/lib/utils';
import { Activity, Server, Clock, Hash } from 'lucide-react';

interface GatewayHealthCardProps {
  gateway?: {
    state: string;
    uptime?: number;
    version?: string;
    pid?: number;
  };
}

function stateColor(state: string): string {
  switch (state) {
    case 'running':
      return 'bg-emerald-500';
    case 'starting':
      return 'bg-amber-500';
    case 'reconnecting':
      return 'bg-blue-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-slate-400';
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case 'running':
      return '运行中';
    case 'starting':
      return '启动中';
    case 'reconnecting':
      return '重连中';
    case 'error':
      return '错误';
    default:
      return '已停止';
  }
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds < 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function GatewayHealthCard({ gateway }: GatewayHealthCardProps) {
  const state = gateway?.state ?? 'stopped';

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card',
                stateColor(state)
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Gateway 状态</p>
            <p className="text-xs text-muted-foreground">{stateLabel(state)}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>PID {gateway?.pid ?? '-'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>运行 {formatUptime(gateway?.uptime)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span>{gateway?.version ?? '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
