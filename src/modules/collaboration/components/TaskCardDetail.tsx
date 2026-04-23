/**
 * Collaboration Hall — Task Card Detail Drawer
 *
 * Shows full task information in a right-side sheet drawer.
 */
import { useState, useCallback, useMemo } from 'react';
import type { HallTaskCard, HallParticipant, HallExecutionLogEntry, TaskArtifact } from '../types';
import { StageFlow } from './StageFlow';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  User,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  FileText,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Hammer,
} from 'lucide-react';

interface TaskCardDetailProps {
  taskCard: HallTaskCard | null;
  participants: HallParticipant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign?: (taskCardId: string, participantId: string, label: string) => void;
  onHandoff?: (taskCardId: string, nextParticipantId: string, nextLabel: string) => void;
  onReview?: (taskCardId: string, outcome: 'approved' | 'rejected') => void;
  onBlock?: (taskCardId: string, reason?: string) => void;
  onUnblock?: (taskCardId: string) => void;
  onDispatch?: (taskCardId: string, participantId: string) => void;
}

function ExecutionLogTimeline({ logs }: { logs?: HallExecutionLogEntry[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        暂无执行记录
      </div>
    );
  }

  const actionIcons: Record<string, React.ReactNode> = {
    assigned: <User className="h-3 w-3" />,
    started: <Hammer className="h-3 w-3" />,
    handoff: <ArrowRightLeft className="h-3 w-3" />,
    completed: <CheckCircle2 className="h-3 w-3" />,
    blocked: <XCircle className="h-3 w-3" />,
  };

  const actionColors: Record<string, string> = {
    assigned: 'bg-blue-100 text-blue-700',
    started: 'bg-emerald-100 text-emerald-700',
    handoff: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    blocked: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-3">
      {logs.map((log, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full',
                actionColors[log.action] || 'bg-muted text-muted-foreground'
              )}
            >
              {actionIcons[log.action] || <Clock className="h-3 w-3" />}
            </div>
            {idx < logs.length - 1 && (
              <div className="mt-1 h-full w-px bg-border" />
            )}
          </div>
          <div className="pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{log.participantLabel}</span>
              <Badge variant="outline" className="text-[10px]">
                {log.action === 'assigned'
                  ? '指派'
                  : log.action === 'started'
                    ? '开始'
                    : log.action === 'handoff'
                      ? '交接'
                      : log.action === 'completed'
                        ? '完成'
                        : log.action === 'blocked'
                          ? '阻塞'
                          : log.action}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(log.timestamp).toLocaleString('zh-CN')}
              </span>
            </div>
            {log.note && (
              <p className="mt-0.5 text-xs text-muted-foreground">{log.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtifactList({ artifacts }: { artifacts?: TaskArtifact[] }) {
  if (!artifacts || artifacts.length === 0) return null;

  const typeIcons: Record<string, React.ReactNode> = {
    code: <FileText className="h-3.5 w-3.5" />,
    doc: <FileText className="h-3.5 w-3.5" />,
    link: <ExternalLink className="h-3.5 w-3.5" />,
    other: <FileText className="h-3.5 w-3.5" />,
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">产物引用</h4>
      <div className="space-y-1.5">
        {artifacts.map((art) => (
          <a
            key={art.artifactId}
            href={art.location}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            <span className="text-muted-foreground">
              {typeIcons[art.type] || typeIcons.other}
            </span>
            <span className="flex-1 truncate font-medium">{art.label}</span>
            <span className="text-[10px] uppercase text-muted-foreground">
              {art.type}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function TaskCardDetail({
  taskCard,
  participants,
  open,
  onOpenChange,
  onAssign,
  onHandoff,
  onReview,
  onBlock,
  onUnblock,
  onDispatch,
}: TaskCardDetailProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [_blockReason, _setBlockReason] = useState('');

  const activeParticipants = useMemo(
    () => participants.filter((p) => p.active),
    [participants]
  );

  const handleAssign = useCallback(() => {
    if (!taskCard || !selectedParticipantId) return;
    const p = participants.find((x) => x.participantId === selectedParticipantId);
    if (!p) return;
    onAssign?.(taskCard.taskCardId, p.participantId, p.displayName);
    setSelectedParticipantId('');
  }, [taskCard, selectedParticipantId, participants, onAssign]);

  const handleHandoff = useCallback(() => {
    if (!taskCard || !selectedParticipantId) return;
    const p = participants.find((x) => x.participantId === selectedParticipantId);
    if (!p) return;
    onHandoff?.(taskCard.taskCardId, p.participantId, p.displayName);
    setSelectedParticipantId('');
  }, [taskCard, selectedParticipantId, participants, onHandoff]);

  if (!taskCard) return null;

  const budgetProgress =
    taskCard.budgetLimit && taskCard.budgetLimit > 0
      ? Math.min(
          100,
          Math.round(
            ((taskCard.budgetAlertThreshold || 0) / taskCard.budgetLimit) * 100
          )
        )
      : 0;

  const isBlocked = taskCard.stage === 'blocked';
  const isCompleted = taskCard.stage === 'completed';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">{taskCard.title}</SheetTitle>
          <SheetDescription className="text-xs">
            {taskCard.description}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-2">
          {/* Stage Flow */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              当前阶段
            </h4>
            <StageFlow stage={taskCard.stage} />
          </div>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border p-2.5">
              <div className="mb-1 text-muted-foreground">负责人</div>
              <div className="flex items-center gap-1.5 font-medium">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {taskCard.currentOwnerLabel || '未指派'}
              </div>
            </div>
            <div className="rounded-md border p-2.5">
              <div className="mb-1 text-muted-foreground">状态</div>
              <div className="font-medium">
                {isBlocked
                  ? '阻塞'
                  : isCompleted
                    ? '已完成'
                    : taskCard.status === 'in_progress'
                      ? '进行中'
                      : taskCard.status === 'done'
                        ? '已完成'
                        : '待办'}
              </div>
            </div>
            {taskCard.dueDate && (
              <div className="rounded-md border p-2.5">
                <div className="mb-1 text-muted-foreground">截止日期</div>
                <div className="font-medium">
                  {new Date(taskCard.dueDate).toLocaleDateString('zh-CN')}
                </div>
              </div>
            )}
            {taskCard.doneWhen && (
              <div className="col-span-2 rounded-md border p-2.5">
                <div className="mb-1 text-muted-foreground">完成的定义 (DOD)</div>
                <div className="font-medium">{taskCard.doneWhen}</div>
              </div>
            )}
          </div>

          {/* Budget */}
          {taskCard.budgetLimit && taskCard.budgetLimit > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                预算消耗
              </h4>
              <div className="space-y-1.5">
                <Progress value={budgetProgress} className="h-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>已消耗 {budgetProgress}%</span>
                  <span>限额 {taskCard.budgetLimit}</span>
                </div>
              </div>
            </div>
          )}

          {/* Rollback plan */}
          {taskCard.rollbackPlan && (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <RotateCcw className="h-3 w-3" />
                回滚计划
              </h4>
              <p className="rounded-md border bg-muted/50 p-2 text-xs">
                {taskCard.rollbackPlan}
              </p>
            </div>
          )}

          {/* Blockers */}
          {taskCard.blockers.length > 0 && (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                阻塞项
              </h4>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-red-600/80">
                {taskCard.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          {/* Execution Log */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              执行历史
            </h4>
            <ExecutionLogTimeline logs={taskCard.executionLog} />
          </div>

          <Separator />

          {/* Artifacts */}
          <ArtifactList artifacts={taskCard.artifactRefs} />

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">操作</h4>

            {/* Participant selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground">选择参与者</label>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                value={selectedParticipantId}
                onChange={(e) => setSelectedParticipantId(e.target.value)}
              >
                <option value="">-- 选择 --</option>
                {activeParticipants.map((p) => (
                  <option key={p.participantId} value={p.participantId}>
                    {p.displayName} ({p.semanticRole})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {taskCard.stage === 'discussion' && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!selectedParticipantId}
                  onClick={handleAssign}
                >
                  <User className="mr-1 h-3 w-3" />
                  指派
                </Button>
              )}

              {(taskCard.stage === 'execution' || taskCard.stage === 'review') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!selectedParticipantId}
                  onClick={handleHandoff}
                >
                  <ArrowRightLeft className="mr-1 h-3 w-3" />
                  交接
                </Button>
              )}

              {taskCard.stage === 'review' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50"
                    onClick={() => onReview?.(taskCard.taskCardId, 'approved')}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => onReview?.(taskCard.taskCardId, 'rejected')}
                  >
                    <XCircle className="mr-1 h-3 w-3" />
                    驳回
                  </Button>
                </>
              )}

              {!isBlocked && !isCompleted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onBlock?.(taskCard.taskCardId, _blockReason || undefined)}
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  标记阻塞
                </Button>
              )}

              {isBlocked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onUnblock?.(taskCard.taskCardId)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  解除阻塞
                </Button>
              )}

              {selectedParticipantId && !isCompleted && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => onDispatch?.(taskCard.taskCardId, selectedParticipantId)}
                >
                  <MessageSquare className="mr-1 h-3 w-3" />
                  手动触发
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
