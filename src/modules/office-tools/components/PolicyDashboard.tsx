/**
 * PolicyDashboard — Stats overview for the policy management page
 */
import { Users, FileCheck, DollarSign, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OfficeToolsStats } from '../types';

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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title} className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {item.title}
            </CardTitle>
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${item.bg}`}>
              <item.icon className={`h-3.5 w-3.5 ${item.color}`} strokeWidth={2.5} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-foreground">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
