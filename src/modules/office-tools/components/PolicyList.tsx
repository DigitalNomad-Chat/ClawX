/**
 * PolicyList — Family-grouped policy list with expand/collapse
 */
import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PolicyFamily, PolicyRecord } from '../types';

interface PolicyListProps {
  families: PolicyFamily[];
  onAddPolicy: (familyId: string, familyName: string) => void;
  onEditPolicy: (policy: PolicyRecord) => void;
  onDeletePolicy: (policy: PolicyRecord) => void;
  onDeleteFamily: (family: PolicyFamily) => void;
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: '生效中', variant: 'default' },
  pending: { label: '待生效', variant: 'secondary' },
  lapsed: { label: '已失效', variant: 'destructive' },
  terminated: { label: '已终止', variant: 'outline' },
};

export function PolicyList({
  families,
  onAddPolicy,
  onEditPolicy,
  onDeletePolicy,
  onDeleteFamily,
}: PolicyListProps) {
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const toggleFamily = (id: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/30 py-12">
        <Users className="h-8 w-8 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">暂无家庭分组</p>
        <p className="text-xs text-muted-foreground/60">点击上方按钮添加家庭</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {families.map((family) => {
        const isExpanded = expandedFamilies.has(family.id);
        return (
          <div
            key={family.id}
            className="rounded-lg border border-border/60 bg-card/40 overflow-hidden"
          >
            {/* Family Header */}
            <button
              onClick={() => toggleFamily(family.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                'hover:bg-muted/40'
              )}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{family.name}</div>
                <div className="text-xs text-muted-foreground">
                  {family.memberCount} 张保单 · 保费 {family.totalPremium.toLocaleString()} · 保额 {family.totalSumAssured.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddPolicy(family.id, family.name);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFamily(family);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </button>

            {/* Policies */}
            {isExpanded && (
              <div className="border-t border-border/40">
                {family.policies.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    暂无保单，点击 + 添加
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {family.policies.map((policy) => {
                      const status = statusMap[policy.status] ?? { label: policy.status, variant: 'outline' as const };
                      return (
                        <div
                          key={policy.id}
                          className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
                            <Shield className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </div>
                          <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5 items-center">
                            <div className="text-sm font-medium text-foreground truncate">
                              {policy.productName || policy.policyNo}
                            </div>
                            <Badge variant={status.variant} className="text-[10px] h-5 px-1.5 shrink-0">
                              {status.label}
                            </Badge>
                            <div className="text-xs text-muted-foreground tabular-nums shrink-0 text-right">
                              {policy.premium > 0 ? `${policy.premium.toLocaleString()}` : '-'} / {policy.sumAssured > 0 ? `${policy.sumAssured.toLocaleString()}` : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate col-span-3">
                              {policy.insurer} · {policy.policyNo}
                              {policy.effectiveDate && ` · ${policy.effectiveDate} 至 ${policy.expiryDate || '长期'}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onEditPolicy(policy)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => onDeletePolicy(policy)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
