/**
 * Dashboard Page
 * System overview with health cards and token usage trends.
 */
import { useEffect } from 'react';
import { useDashboardStore } from './store';
import { ModulePageLayout } from '../_shared/ModulePageLayout';
import { StatCard } from './components/StatCard';
import { TokenTrendChart } from './components/TokenTrendChart';
import { GatewayHealthCard } from './components/GatewayHealthCard';
import { Activity, Bot, CalendarDays, Hash, RotateCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const { overview, loading, error, fetchOverview } = useDashboardStore();

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchOverview();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  const stats = overview?.stats;
  const isRunning = overview?.gateway.state === 'running';

  return (
    <ModulePageLayout>
      <div className="flex h-full flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">仪表盘</h1>
              <p className="text-sm text-muted-foreground">系统概览与健康状态</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchOverview()} disabled={loading}>
            <RotateCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-8">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Gateway Health */}
          <div>
            <GatewayHealthCard gateway={overview?.gateway} />
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="智能体数量"
              value={stats?.agentCount ?? 0}
              icon={<Bot className="h-5 w-5" />}
              isLoading={loading && !stats}
            />
            <StatCard
              label="会话数量"
              value={stats?.sessionCount ?? 0}
              icon={<Hash className="h-5 w-5" />}
              isLoading={loading && !stats}
            />
            <StatCard
              label="定时任务"
              value={stats?.cronJobCount ?? 0}
              icon={<CalendarDays className="h-5 w-5" />}
              isLoading={loading && !stats}
            />
            <StatCard
              label="Token 消耗"
              value={stats?.totalTokensUsed ?? 0}
              icon={<Activity className="h-5 w-5" />}
              isLoading={loading && !stats}
              formatter={(v) => v.toLocaleString()}
            />
          </div>

          {/* Token Trend Chart */}
          {isRunning && (
            <div>
              <TokenTrendChart data={overview?.tokenHistory ?? []} />
            </div>
          )}
        </div>
      </div>
    </ModulePageLayout>
  );
}
