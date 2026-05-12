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
  Loader2,
  CheckCircle2,
  WifiOff,
  HelpCircle,
  ChevronRight,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MessageStream } from './components/MessageStream';
import { TaskCardDetail } from './components/TaskCardDetail';
import { CompactStageFlow } from './components/StageFlow';
import { PixelAvatar } from './components/PixelAvatar';
import { setCollabLang, getCollabLang, t, type I18nLang } from './i18n';
import { TutorialPanel } from './components/TutorialPanel';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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
    review: 'bg-blue-50 text-blue-600 border-blue-200',
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
  onQuickAssign,
  onQuickApprove,
  onQuickReject,
  onQuickUnblock,
}: {
  taskCard: HallTaskCard;
  selected: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
  onQuickAssign?: (taskCardId: string) => void;
  onQuickApprove?: (taskCardId: string) => void;
  onQuickReject?: (taskCardId: string) => void;
  onQuickUnblock?: (taskCardId: string) => void;
}) {
  const isBlocked = taskCard.stage === 'blocked';
  const isReview = taskCard.stage === 'review';
  const isDiscussion = taskCard.stage === 'discussion';

  return (
    <motion.div
      layout
      initial={false}
      animate={{ scale: selected ? 1.01 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'group cursor-pointer border-b border-border/50 p-2.5 transition-colors hover:bg-accent/50 last:border-b-0',
        selected && 'border-l-2 border-l-primary bg-primary/5'
      )}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center justify-between">
        <StageBadge stage={taskCard.stage} />
        <div className="flex items-center gap-1">
          <CompactStageFlow taskCard={taskCard} />
          <button
            type="button"
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            详情 <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <h4 className="mb-1 text-sm font-medium">{taskCard.title}</h4>
      <p className="mb-2 line-clamp-3 text-[11px] text-muted-foreground">{taskCard.description}</p>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {taskCard.currentOwnerLabel || '未指派'}
        </span>
        <span>{STATUS_LABELS[taskCard.status] || taskCard.status}</span>
      </div>

      {/* Quick actions */}
      {selected && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
          {isDiscussion && onQuickAssign && (
            <Button
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAssign(taskCard.taskCardId);
              }}
            >
              <User className="mr-1 h-3 w-3" />
              指派并执行
            </Button>
          )}
          {isReview && (
            <>
              {onQuickApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] px-2 border-green-200 text-green-700 hover:bg-green-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickApprove(taskCard.taskCardId);
                  }}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  通过
                </Button>
              )}
              {onQuickReject && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] px-2 border-red-200 text-red-700 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickReject(taskCard.taskCardId);
                  }}
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  驳回
                </Button>
              )}
            </>
          )}
          {isBlocked && onQuickUnblock && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={(e) => {
                e.stopPropagation();
                onQuickUnblock(taskCard.taskCardId);
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              解除阻塞
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
//  Member Status Bar — shows participant status (idle / typing / executing)
// ---------------------------------------------------------------------------

type MemberStatus = 'idle' | 'typing' | 'executing' | 'offline';

interface MemberState {
  participantId: string;
  displayName: string;
  semanticRole?: string;
  status: MemberStatus;
  lastActivity?: number;
}

function statusLabel(status: MemberStatus): string {
  switch (status) {
    case 'typing': return '输入中';
    case 'executing': return '执行中';
    case 'offline': return '离线';
    default: return '空闲';
  }
}

function statusIcon(status: MemberStatus) {
  switch (status) {
    case 'typing':
      return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
    case 'executing':
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
    case 'offline':
      return <WifiOff className="h-3 w-3 text-muted-foreground" />;
    default:
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  }
}

function statusColor(status: MemberStatus): string {
  switch (status) {
    case 'typing': return 'text-blue-500';
    case 'executing': return 'text-primary';
    case 'offline': return 'text-muted-foreground';
    default: return 'text-emerald-500';
  }
}

function MemberStatusBar({
  members,
  onClearStatus,
}: {
  members: MemberState[];
  onClearStatus?: (participantId: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-2.5 overflow-x-auto px-1 py-2 text-xs">
      {members.map((m) => (
        <button
          key={m.participantId}
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-full border px-2.5 py-1 transition-all text-xs',
            m.status === 'typing' || m.status === 'executing'
              ? 'border-primary/30 bg-primary/5 shadow-sm'
              : 'bg-background hover:bg-accent/50',
          )}
          onClick={() => {
            if (m.status !== 'idle' && m.status !== 'offline' && onClearStatus) {
              onClearStatus(m.participantId);
            }
          }}
          title={`${m.displayName}: ${statusLabel(m.status)}`}
        >
          <PixelAvatar
            participantId={m.participantId}
            role={m.semanticRole}
            size={20}
            className="h-5 w-5 rounded-full"
          />
          <span className="font-medium">{m.displayName}</span>
          <span className={cn('flex items-center gap-1 text-[11px]', statusColor(m.status))}>
            {statusIcon(m.status)}
            <span className="hidden sm:inline">{statusLabel(m.status)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Main Page
// ---------------------------------------------------------------------------

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
    autoAssignTask,
    stopTask,
    setExecutionOrder,
    continueDiscussion,
    addArtifact,
    removeArtifact,
  } = useCollaborationStore();

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTaskCardId, setDetailTaskCardId] = useState<string | null>(null);
  const [lang, setLang] = useState<I18nLang>(getCollabLang());
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Member status tracking from SSE events
  const [memberStatusMap, setMemberStatusMap] = useState<Record<string, { status: MemberStatus; lastActivity: number }>>({});

  const updateMemberStatus = useCallback((participantId: string, status: MemberStatus) => {
    setMemberStatusMap((prev) => ({
      ...prev,
      [participantId]: { status, lastActivity: Date.now() },
    }));
  }, []);

  const clearMemberStatus = useCallback((participantId: string) => {
    setMemberStatusMap((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
  }, []);

  // Auto-clear typing/executing status after 60s of inactivity
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setMemberStatusMap((prev) => {
        const copy = { ...prev };
        for (const [pid, state] of Object.entries(copy)) {
          if ((state.status === 'typing' || state.status === 'executing') && now - state.lastActivity > 60_000) {
            delete copy[pid];
          }
        }
        return copy;
      });
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

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

  // Derive member states for the status bar
  const memberStates: MemberState[] = useMemo(() => {
    if (!hall?.participants) return [];
    return hall.participants
      .filter((p) => p.active)
      .map((p) => {
        const tracked = memberStatusMap[p.participantId];
        return {
          participantId: p.participantId,
          displayName: p.displayName,
          semanticRole: p.semanticRole,
          status: tracked?.status ?? 'idle',
          lastActivity: tracked?.lastActivity,
        };
      });
  }, [hall?.participants, memberStatusMap]);

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
    try {
      await createTaskCard({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        createdByParticipantId: currentParticipant.participantId,
      });
      setNewTaskTitle('');
      setNewTaskDesc('');
      setShowNewTask(false);
      toast.success('任务已创建');
    } catch (err) {
      toast.error(`创建失败: ${String(err)}`);
    }
  }, [newTaskTitle, newTaskDesc, createTaskCard, currentParticipant]);

  const handleOpenDetail = useCallback((taskCardId: string) => {
    setDetailTaskCardId(taskCardId);
    setDetailOpen(true);
  }, []);

  const handleAssign = useCallback(
    async (taskCardId: string, participantId: string, label: string) => {
      try {
        await assignTask(taskCardId, participantId, label, { dispatch: true });
        setDetailOpen(false);
        toast.success(`已指派给 ${label}`);
      } catch (err) {
        toast.error(`指派失败: ${String(err)}`);
      }
    },
    [assignTask]
  );

  const handleHandoff = useCallback(
    async (taskCardId: string, nextParticipantId: string, nextLabel: string) => {
      try {
        await handoffTask(taskCardId, nextParticipantId, nextLabel, { dispatch: true });
        setDetailOpen(false);
        toast.success(`已交接给 ${nextLabel}`);
      } catch (err) {
        toast.error(`交接失败: ${String(err)}`);
      }
    },
    [handoffTask]
  );

  const handleReview = useCallback(
    async (taskCardId: string, outcome: 'approved' | 'rejected') => {
      try {
        await submitReview(taskCardId, currentParticipant.participantId, outcome);
        setDetailOpen(false);
        toast[outcome === 'approved' ? 'success' : 'warning'](outcome === 'approved' ? '审核通过' : '已驳回');
      } catch (err) {
        toast.error(`审核失败: ${String(err)}`);
      }
    },
    [submitReview, currentParticipant]
  );

  const handleBlock = useCallback(
    async (taskCardId: string, reason?: string) => {
      try {
        await updateTaskCard(taskCardId, {
          stage: 'blocked',
          status: 'blocked',
          blockers: reason ? [reason] : undefined,
        });
        toast.warning('已标记阻塞');
      } catch (err) {
        toast.error(`标记阻塞失败: ${String(err)}`);
      }
    },
    [updateTaskCard]
  );

  const handleUnblock = useCallback(
    async (taskCardId: string) => {
      try {
        await updateTaskCard(taskCardId, {
          stage: 'discussion',
          status: 'todo',
          blockers: [],
        });
        toast.success('已解除阻塞');
      } catch (err) {
        toast.error(`解除阻塞失败: ${String(err)}`);
      }
    },
    [updateTaskCard]
  );

  const handleDispatch = useCallback(
    async (taskCardId: string, participantId: string) => {
      try {
        await dispatchTask(taskCardId, participantId);
        toast.success('已触发执行');
      } catch (err) {
        toast.error(`触发失败: ${String(err)}`);
      }
    },
    [dispatchTask]
  );

  const handleStop = useCallback(
    async (taskCardId: string) => {
      try {
        await stopTask(taskCardId);
        toast.warning('已停止执行');
      } catch (err) {
        toast.error(`停止失败: ${String(err)}`);
      }
    },
    [stopTask]
  );

  const handleContinueDiscussion = useCallback(
    async (taskCardId: string, openedByParticipantId: string) => {
      try {
        await continueDiscussion(taskCardId, openedByParticipantId);
        toast.success('已开启新讨论');
      } catch (err) {
        toast.error(`开启讨论失败: ${String(err)}`);
      }
    },
    [continueDiscussion]
  );

  const handleSetExecutionOrder = useCallback(
    async (taskCardId: string, order: string[], items: import('./types').HallExecutionItem[]) => {
      try {
        await setExecutionOrder(taskCardId, order, items);
        toast.success('执行计划已保存');
      } catch (err) {
        toast.error(`保存失败: ${String(err)}`);
      }
    },
    [setExecutionOrder]
  );

  // Quick action handlers
  const handleQuickAssign = useCallback(
    async (taskCardId: string) => {
      try {
        await autoAssignTask(taskCardId);
        toast.success('已自动指派并开始执行');
      } catch (err) {
        toast.error(`自动指派失败: ${String(err)}`);
      }
    },
    [autoAssignTask]
  );

  const handleQuickApprove = useCallback(
    async (taskCardId: string) => {
      try {
        await submitReview(taskCardId, currentParticipant.participantId, 'approved');
        toast.success('审核通过');
      } catch (err) {
        toast.error(`审核失败: ${String(err)}`);
      }
    },
    [submitReview, currentParticipant]
  );

  const handleQuickReject = useCallback(
    async (taskCardId: string) => {
      try {
        await submitReview(taskCardId, currentParticipant.participantId, 'rejected');
        toast.warning('已驳回');
      } catch (err) {
        toast.error(`驳回失败: ${String(err)}`);
      }
    },
    [submitReview, currentParticipant]
  );

  const handleQuickUnblock = useCallback(
    async (taskCardId: string) => {
      try {
        await updateTaskCard(taskCardId, {
          stage: 'discussion',
          status: 'todo',
          blockers: [],
        });
        toast.success('已解除阻塞');
      } catch (err) {
        toast.error(`解除失败: ${String(err)}`);
      }
    },
    [updateTaskCard]
  );

  return (
    <ModulePageLayout title={t('hall.messages', lang)} compact>
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex h-full gap-3">
        {/* Left: Messages */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <MessageStream
            renderMemberBar={
              <MemberStatusBar
                members={memberStates}
                onClearStatus={clearMemberStatus}
              />
            }
            hallId={hall?.hallId}
            currentParticipant={currentParticipant}
            participants={hall?.participants || []}
            selectedTaskCardId={selectedTaskCardId}
            selectedTaskCard={selectedTaskCard || null}
            onSelectTaskCard={selectTaskCard}
            onDraftChunk={(_draftId: string, _chunk: string, authorLabel?: string) => {
              // Infer participant from authorLabel and mark as typing
              if (hall?.participants && authorLabel) {
                const participant = hall.participants.find((p) => p.displayName === authorLabel);
                if (participant) {
                  updateMemberStatus(participant.participantId, 'typing');
                }
              }
            }}
            onDraftFinalize={(_draftId: string, _message: unknown, authorLabel?: string) => {
              if (hall?.participants && authorLabel) {
                const participant = hall.participants.find((p) => p.displayName === authorLabel);
                if (participant) {
                  clearMemberStatus(participant.participantId);
                }
              }
            }}
            onDraftAbort={(_draftId: string, _reason: string, authorLabel?: string) => {
              if (hall?.participants && authorLabel) {
                const participant = hall.participants.find((p) => p.displayName === authorLabel);
                if (participant) {
                  clearMemberStatus(participant.participantId);
                }
              }
            }}
          />
        </div>

        {/* Right: Task Cards */}
        <div className="flex w-[360px] min-w-[320px] max-w-[400px] flex-col overflow-hidden border-l bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-medium">{t('task.task_board', lang)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  lang === 'zh' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => {
                  setLang('zh');
                  setCollabLang('zh');
                }}
              >
                中
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => {
                  setLang('en');
                  setCollabLang('en');
                }}
              >
                EN
              </button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTutorialOpen(true)} title="使用指南">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
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
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setShowNewTask(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-7 text-[11px]" onClick={() => void handleCreateTask()}>
                  创建
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {taskCards.length === 0 && (
              <div className="py-8 text-center text-[11px] text-muted-foreground">暂无任务</div>
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
                onQuickAssign={handleQuickAssign}
                onQuickApprove={handleQuickApprove}
                onQuickReject={handleQuickReject}
                onQuickUnblock={handleQuickUnblock}
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
        onStop={handleStop}
        onContinueDiscussion={handleContinueDiscussion}
        onSetExecutionOrder={handleSetExecutionOrder}
        onAddArtifact={(_, input) => {
          void addArtifact(detailTaskCardId!, input).then(() => toast.success('产物已添加')).catch((err) => toast.error(`添加失败: ${String(err)}`));
        }}
        onDeleteArtifact={(_, artifactId) => {
          void removeArtifact(detailTaskCardId!, artifactId).then(() => toast.success('产物已移除')).catch((err) => toast.error(`移除失败: ${String(err)}`));
        }}
      />

      <TutorialPanel open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </ModulePageLayout>
  );
}
