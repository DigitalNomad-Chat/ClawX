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
import { Activity, Bot, CalendarDays, Hash, RotateCw } from 'lucide-react';
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
    <ModulePageLayout
      title="仪表盘"
      actions={
        <Button variant="outline" size="sm" onClick={() => void fetchOverview()} disabled={loading}>
          <RotateCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Gateway Health */}
      <div className="mb-6">
        <GatewayHealthCard gateway={overview?.gateway} />
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="mb-6">
          <TokenTrendChart data={overview?.tokenHistory ?? []} />
        </div>
      )}
    </ModulePageLayout>
  );
}
