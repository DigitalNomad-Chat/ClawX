/**
 * GoClaw - 共享 Agent 组件
 * AgentCard + AgentDetailDialog + AgentCardData 类型
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Shield, Store, Code, Megaphone, Palette, Package, Briefcase, Settings, Star, Gamepad2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentCardData {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version: string;
}

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  全部: <Store className="h-4 w-4" />,
  工程: <Code className="h-4 w-4" />,
  营销: <Megaphone className="h-4 w-4" />,
  设计: <Palette className="h-4 w-4" />,
  产品: <Package className="h-4 w-4" />,
  商务: <Briefcase className="h-4 w-4" />,
  运营: <Settings className="h-4 w-4" />,
  专项: <Star className="h-4 w-4" />,
  创意: <Gamepad2 className="h-4 w-4" />,
  通用: <Users className="h-4 w-4" />,
  管理: <Shield className="h-4 w-4" />,
};

/** Agent IDs that belong to the Manager (Lobster Steward) suite */
export const MANAGER_AGENT_IDS = [
  'openclaw-recruiter',
  'openclaw-optimizer',
  'openclaw-inspector',
  'openclaw-cleaner',
];

/** 前端展示名称映射（覆盖后端原始名称） */
export const AGENT_DISPLAY_NAME_MAP: Record<string, string> = {
  'openclaw-recruiter': '招聘专员',
  'openclaw-optimizer': '培训专员',
  'openclaw-inspector': '成长专员',
  'openclaw-cleaner': '解聘专员',
};

export function AgentCard({
  agent,
  onClick,
  onHire,
  variant = 'default',
}: {
  agent: AgentCardData;
  onClick: () => void;
  onHire: () => void;
  variant?: 'default' | 'manager' | 'pinned';
}) {
  const isManager = variant === 'manager';

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl p-5 transition-all cursor-pointer',
        isManager
          ? 'bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] border border-primary/20 hover:border-primary/40 hover:shadow-md'
          : variant === 'pinned'
            ? 'bg-gradient-to-br from-card to-primary/5 border border-primary/40 hover:border-primary/50 hover:shadow-md'
            : 'border bg-card hover:shadow-md hover:border-primary/30'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl',
            isManager ? 'h-12 w-12' : 'h-11 w-11'
          )}
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{agent.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{agent.creature}</p>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Scenarios — only for default cards */}
      {variant === 'default' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {agent.scenarios.slice(0, 3).map((scenario) => (
            <span
              key={scenario}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {CATEGORY_ICONS[scenario] || <Sparkles className="h-3 w-3" />}
              {scenario}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">v{agent.version}</span>
        <Button
          size="sm"
          variant={isManager ? 'default' : 'default'}
          onClick={(e) => {
            e.stopPropagation();
            onHire();
          }}
        >
          {isManager ? '雇佣' : '雇佣'}
        </Button>
      </div>
    </div>
  );
}

export function AgentDetailDialog({
  agent,
  onClose,
  onHire,
}: {
  agent: AgentCardData;
  onClose: () => void;
  onHire: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-4xl">
            {agent.emoji}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">
              {agent.name} / {agent.nickname}
            </h2>
            <p className="text-sm text-muted-foreground">
              {agent.creature} · {agent.vibe}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">角色简介</h3>
          <p className="mt-1 text-sm">{agent.description}</p>
        </div>

        {/* Scenarios */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">擅长场景</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {agent.scenarios.map((scenario) => (
              <Badge key={scenario} variant="outline">
                {scenario}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">标签</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {agent.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Version */}
        <div className="mt-4 text-xs text-muted-foreground">
          版本: {agent.version}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" onClick={onHire}>
            雇佣此 Agent
          </Button>
          <Button variant="outline" onClick={onClose}>
            返回
          </Button>
        </div>
      </div>
    </div>
  );
}
