/**
 * Collaboration Hall — Stage Flow Visualization
 *
 * Shows the current stage of a task card in a horizontal pipeline.
 */
import type { HallTaskStage, HallTaskCard } from '../types';
import { cn } from '@/lib/utils';
import {
  MessageCircle,
  Hammer,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const STAGES: { key: HallTaskStage; label: string; icon: React.ReactNode }[] = [
  { key: 'discussion', label: '讨论中', icon: <MessageCircle className="h-4 w-4" /> },
  { key: 'execution', label: '执行中', icon: <Hammer className="h-4 w-4" /> },
  { key: 'review', label: '评审中', icon: <ClipboardCheck className="h-4 w-4" /> },
  { key: 'completed', label: '已完成', icon: <CheckCircle2 className="h-4 w-4" /> },
];

interface StageFlowProps {
  stage: HallTaskStage;
  className?: string;
}

export function StageFlow({ stage, className }: StageFlowProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {STAGES.map((s, idx) => {
        const isCurrent = s.key === stage;
        const isPast = idx < currentIndex;
        const isBlocked = stage === 'blocked' && idx <= currentIndex;

        return (
          <div key={s.key} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                isBlocked
                  ? 'bg-red-50 text-red-600'
                  : isCurrent
                    ? 'bg-primary text-primary-foreground shadow-sm animate-pulse'
                    : isPast
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-muted text-muted-foreground'
              )}
            >
              {isBlocked ? <AlertCircle className="h-3.5 w-3.5" /> : s.icon}
              <span>{s.label}</span>
            </div>
            {idx < STAGES.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-px w-4',
                  isPast ? 'bg-emerald-300' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface CompactStageFlowProps {
  taskCard: HallTaskCard;
  className?: string;
}

export function CompactStageFlow({ taskCard, className }: CompactStageFlowProps) {
  const isBlocked = taskCard.stage === 'blocked';
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isBlocked ? (
        <div className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
          <AlertCircle className="h-3 w-3" />
          阻塞
        </div>
      ) : (
        STAGES.map((s) => {
          const isCurrent = s.key === taskCard.stage;
          const isPast =
            STAGES.findIndex((x) => x.key === s.key) <
            STAGES.findIndex((x) => x.key === taskCard.stage);
          return (
            <div
              key={s.key}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isCurrent
                  ? 'bg-primary'
                  : isPast
                    ? 'bg-emerald-400'
                    : 'bg-muted'
              )}
              title={s.label}
            />
          );
        })
      )}
    </div>
  );
}
