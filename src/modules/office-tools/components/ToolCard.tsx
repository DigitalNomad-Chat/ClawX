/**
 * ToolCard — Grid card for an office tool entry
 */
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  Shield,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import type { OfficeTool } from '../types';

const iconMap: Record<string, LucideIcon> = {
  shield: Shield,
  'file-text': FileText,
  briefcase: Briefcase,
};

interface ToolCardProps {
  tool: OfficeTool;
}

export function ToolCard({ tool }: ToolCardProps) {
  const navigate = useNavigate();
  const Icon = iconMap[tool.icon] ?? Briefcase;

  return (
    <button
      onClick={() => navigate(tool.path)}
      disabled={tool.disabled}
      className={cn(
        'group relative flex flex-col items-start gap-3 rounded-xl border bg-card p-5 text-left transition-all duration-200',
        'hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        tool.disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none'
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        {tool.badge && (
          <Badge variant="secondary" className="text-xs">
            {tool.badge}
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{tool.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {tool.description}
        </p>
      </div>
    </button>
  );
}
