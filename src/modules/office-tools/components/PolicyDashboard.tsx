/**
 * PolicyDashboard — Stats overview with renewal reminders and distributions
 */
import { Users, FileCheck, DollarSign, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { OfficeToolsStats } from '../types';
import {
  INSURANCE_TYPE_COLORS,
  RENEWAL_STATUS_LABELS,
  RENEWAL_STATUS_TYPES,
  type RenewalStatus,
} from '../constants';

interface PolicyDashboardProps {
  stats: OfficeToolsStats | null;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function PolicyDashboard({ stats }: PolicyDashboardProps) {
  const items = [
    {
      title: '家庭数',
      value: stats?.totalFamilies ?? 0,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: '保单数',
      value: stats?.totalPolicies ?? 0,
      icon: FileCheck,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      title: '总保费',
      value: formatCurrency(stats?.totalPremium ?? 0),
      icon: DollarSign,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      title: '总保额',
      value: formatCurrency(stats?.totalSumAssured ?? 0),
      icon: ShieldCheck,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
  ];

  const upcoming = stats?.upcomingRenewals ?? { within7Days: 0, within30Days: 0, within60Days: 0 };
  const statusDistribution = stats?.statusDistribution ?? { normal: 0, grace: 0, lapsed: 0, renewed: 0 };
  const typeDistribution = stats?.typeDistribution ?? {};

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-5">
      {/* 基础指标 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        {items.map((item) => (
          <Card key={item.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xs sm:text-xs font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <div className={`flex h-7 w-7 items-center justify-center rounded-md ${item.bg}`}>
                <item.icon className={`h-3.5 w-3.5 ${item.color}`} strokeWidth={2.5} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-xl font-bold text-foreground">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 续期与分布 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:gap-4">
        {/* 待续期提醒 */}
        <Card className="border-border/50 p-4">
          <h3 className="text-sm font-semibold mb-3">待续期提醒</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-destructive/10 rounded-lg">
              <div className="text-2xl font-bold text-destructive">{upcoming.within7Days}</div>
              <div className="text-xs text-muted-foreground">≤7天</div>
            </div>
            <div className="text-center p-2 bg-warning/10 rounded-lg">
              <div className="text-2xl font-bold text-warning">{upcoming.within30Days}</div>
              <div className="text-xs text-muted-foreground">≤30天</div>
            </div>
            <div className="text-center p-2 bg-yellow-500/10 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{upcoming.within60Days}</div>
              <div className="text-xs text-muted-foreground">≤60天</div>
            </div>
          </div>
        </Card>

        {/* 续期状态分布 */}
        <Card className="border-border/50 p-4">
          <h3 className="text-sm font-semibold mb-3">续期状态分布</h3>
          <div className="space-y-2">
            {(Object.keys(statusDistribution) as RenewalStatus[]).map((status) => {
              const count = statusDistribution[status];
              return (
                <div key={status} className="flex items-center justify-between">
                  <Badge variant={RENEWAL_STATUS_TYPES[status]} className="text-[10px]">
                    {RENEWAL_STATUS_LABELS[status]}
                  </Badge>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 险种分布 */}
        <Card className="border-border/50 p-4">
          <h3 className="text-sm font-semibold mb-3">险种分布</h3>
          <div className="space-y-2 max-h-[10.5rem] overflow-auto pr-1">
            {Object.keys(typeDistribution).length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无数据</div>
            ) : (
              Object.entries(typeDistribution).map(([type, count]) => {
                const color = INSURANCE_TYPE_COLORS[type as keyof typeof INSURANCE_TYPE_COLORS] ?? '#C0C4CC';
                return (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm truncate max-w-[8rem]">{type}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
