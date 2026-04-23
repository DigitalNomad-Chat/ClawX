/**
 * Collaboration Hall — Main Page
 * Left: message timeline + input
 * Right: task card list + detail drawer
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useCollaborationStore } from './store';
import { ModulePageLayout } from '../_shared/ModulePageLayout';
import type { HallParticipant, HallTaskCard } from './types';
import {
  Plus,
  User,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MessageStream } from './components/MessageStream';
import { TaskCardDetail } from './components/TaskCardDetail';
import { CompactStageFlow } from './components/StageFlow';

const STAGE_LABELS: Record<string, string> = {
  discussion: '讨论中',
  execution: '执行中',
  review: '评审中',
  blocked: '阻塞',
  completed: '已完成',
};

const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '已完成',
};

function StageBadge({ stage }: { stage: string }) {
  const variants: Record<string, string> = {
    discussion: 'bg-blue-50 text-blue-600 border-blue-200',
    execution: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    review: 'bg-amber-50 text-amber-600 border-amber-200',
    blocked: 'bg-red-50 text-red-600 border-red-200',
    completed: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <Badge variant="outline" className={cn('text-xs', variants[stage] || '')}>
      {STAGE_LABELS[stage] || stage}
    </Badge>
  );
}

function TaskCardItem({
  taskCard,
  selected,
  onClick,
  onOpenDetail,
}: {
  taskCard: HallTaskCard;
  selected: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <div
      className={cn(
        'group cursor-pointer rounded-lg border p-3 transition-colors hover:bg-accent',
        selected && 'border-primary bg-primary/5'
      )}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center justify-between">
        <StageBadge stage={taskCard.stage} />
        <div className="flex items-center gap-1">
          <CompactStageFlow taskCard={taskCard} />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <h4 className="mb-1 text-sm font-medium">{taskCard.title}</h4>
      <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{taskCard.description}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {taskCard.currentOwnerLabel || '未指派'}
        </span>
        <span>{STATUS_LABELS[taskCard.status] || taskCard.status}</span>
      </div>
    </div>
  );
}

export function CollaborationPage() {
  const {
    hall,
    taskCards,
    selectedTaskCardId,
    error,
    fetchOverview,
    createTaskCard,
    selectTaskCard,
    assignTask,
    handoffTask,
    submitReview,
    updateTaskCard,
    dispatchTask,
  } = useCollaborationStore();

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTaskCardId, setDetailTaskCardId] = useState<string | null>(null);

  // Current user identity (fallback)
  const currentParticipant: HallParticipant = useMemo(() => {
    const human = hall?.participants.find((p) => p.isHuman);
    if (human) return human;
    return {
      participantId: 'user',
      displayName: '我',
      semanticRole: 'manager',
      active: true,
      aliases: ['我', 'user'],
    };
  }, [hall]);

  // Initial load
  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  // Auto refresh every 10s (kept as fallback when SSE is offline)
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchOverview();
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  const selectedTaskCard = useMemo(
    () => taskCards.find((t) => t.taskCardId === selectedTaskCardId),
    [taskCards, selectedTaskCardId]
  );

  const detailTaskCard = useMemo(
    () => taskCards.find((t) => t.taskCardId === detailTaskCardId) || null,
    [taskCards, detailTaskCardId]
  );

  const handleCreateTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !newTaskDesc.trim()) return;
    await createTaskCard({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      createdByParticipantId: currentParticipant.participantId,
    });
    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowNewTask(false);
  }, [newTaskTitle, newTaskDesc, createTaskCard, currentParticipant]);

  const handleOpenDetail = useCallback((taskCardId: string) => {
    setDetailTaskCardId(taskCardId);
    setDetailOpen(true);
  }, []);

  const handleAssign = useCallback(
    async (taskCardId: string, participantId: string, label: string) => {
      await assignTask(taskCardId, participantId, label, { dispatch: true });
      setDetailOpen(false);
    },
    [assignTask]
  );

  const handleHandoff = useCallback(
    async (taskCardId: string, nextParticipantId: string, nextLabel: string) => {
      await handoffTask(taskCardId, nextParticipantId, nextLabel, { dispatch: true });
      setDetailOpen(false);
    },
    [handoffTask]
  );

  const handleReview = useCallback(
    async (taskCardId: string, outcome: 'approved' | 'rejected') => {
      await submitReview(taskCardId, currentParticipant.participantId, outcome);
      setDetailOpen(false);
    },
    [submitReview, currentParticipant]
  );

  const handleBlock = useCallback(
    async (taskCardId: string, reason?: string) => {
      await updateTaskCard(taskCardId, {
        stage: 'blocked',
        status: 'blocked',
        blockers: reason ? [reason] : undefined,
      });
    },
    [updateTaskCard]
  );

  const handleUnblock = useCallback(
    async (taskCardId: string) => {
      await updateTaskCard(taskCardId, {
        stage: 'discussion',
        status: 'todo',
        blockers: [],
      });
    },
    [updateTaskCard]
  );

  const handleDispatch = useCallback(
    async (taskCardId: string, participantId: string) => {
      await dispatchTask(taskCardId, participantId);
    },
    [dispatchTask]
  );

  return (
    <ModulePageLayout title="协作大厅">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex h-[calc(100%-2rem)] gap-4">
        {/* Left: Messages */}
        <MessageStream
          hallId={hall?.hallId}
          currentParticipant={currentParticipant}
          participants={hall?.participants || []}
          selectedTaskCardId={selectedTaskCardId}
          selectedTaskCard={selectedTaskCard || null}
          onSelectTaskCard={selectTaskCard}
        />

        {/* Right: Task Cards */}
        <div className="flex w-80 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">任务看板</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewTask((v) => !v)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {showNewTask && (
            <div className="border-b p-3 space-y-2">
              <input
                className="w-full rounded border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                placeholder="任务标题"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <Textarea
                className="min-h-[60px] resize-none text-sm"
                placeholder="任务描述"
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowNewTask(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => void handleCreateTask()}>
                  创建
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {taskCards.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无任务</div>
            )}
            {taskCards.map((card) => (
              <TaskCardItem
                key={card.taskCardId}
                taskCard={card}
                selected={card.taskCardId === selectedTaskCardId}
                onClick={() =>
                  selectTaskCard(card.taskCardId === selectedTaskCardId ? null : card.taskCardId)
                }
                onOpenDetail={() => handleOpenDetail(card.taskCardId)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Task Detail Drawer */}
      <TaskCardDetail
        taskCard={detailTaskCard}
        participants={hall?.participants || []}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onAssign={handleAssign}
        onHandoff={handleHandoff}
        onReview={handleReview}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        onDispatch={handleDispatch}
      />
    </ModulePageLayout>
  );
}
