/**
 * Collaboration Hall — Decision Panel
 *
 * Displays structured decision fields (proposal, decision, doneWhen) for a TaskCard.
 * Collapsible when no structured content is available.
 */
import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import type { HallTaskCard } from '../types';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Gavel,
  Target,
} from 'lucide-react';

interface DecisionPanelProps {
  taskCard: HallTaskCard;
  /** Whether the panel starts expanded; defaults to true when content exists */
  defaultOpen?: boolean;
  className?: string;
}

type DecisionStatus = 'empty' | 'proposing' | 'decided' | 'verified';

function getDecisionStatus(taskCard: HallTaskCard): DecisionStatus {
  if (taskCard.stage === 'completed') return 'verified';
  if (taskCard.decision) return 'decided';
  if (taskCard.proposal) return 'proposing';
  return 'empty';
}

const STATUS_CONFIG: Record<DecisionStatus, { label: string; color: string; dotColor: string }> = {
  empty: { label: '无提案', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
  proposing: { label: '提案中', color: 'text-blue-600', dotColor: 'bg-blue-500' },
  decided: { label: '已决策', color: 'text-emerald-600', dotColor: 'bg-emerald-500' },
  verified: { label: '已验证', color: 'text-green-600', dotColor: 'bg-green-500' },
};

export function DecisionPanel({ taskCard, defaultOpen, className }: DecisionPanelProps) {
  const hasContent = !!(taskCard.proposal || taskCard.decision || taskCard.doneWhen);
  const [open, setOpen] = useState(defaultOpen ?? hasContent);

  const status = useMemo(() => getDecisionStatus(taskCard), [taskCard]);
  const config = STATUS_CONFIG[status];

  // No structured content — render minimal inline badge
  if (!hasContent && status === 'empty') {
    return (
      <div className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5', className)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', config.dotColor)} />
        <span className={cn('text-[11px] font-medium', config.color)}>{config.label}</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border', className)}>
      {/* Header — clickable to toggle */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className={cn('h-1.5 w-1.5 rounded-full', config.dotColor)} />
        <span className="text-xs font-medium">决策面板</span>
        <span className={cn('ml-auto text-[11px] font-medium', config.color)}>
          {config.label}
        </span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t px-3 py-2.5">
              {/* Proposal */}
              {taskCard.proposal && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-blue-600">
                    <FileText className="h-3 w-3" />
                    提案
                  </div>
                  <div className="prose prose-xs max-w-none rounded-md bg-blue-50/50 p-2 text-xs dark:bg-blue-950/20">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{taskCard.proposal}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Decision */}
              {taskCard.decision && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <Gavel className="h-3 w-3" />
                    决策
                  </div>
                  <div className="prose prose-xs max-w-none rounded-md bg-emerald-50/50 p-2 text-xs dark:bg-emerald-950/20">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{taskCard.decision}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* DoneWhen (DOD) */}
              {taskCard.doneWhen && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <Target className="h-3 w-3" />
                    完成定义 (DOD)
                  </div>
                  <div className="prose prose-xs max-w-none rounded-md bg-amber-50/50 p-2 text-xs dark:bg-amber-950/20">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{taskCard.doneWhen}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
