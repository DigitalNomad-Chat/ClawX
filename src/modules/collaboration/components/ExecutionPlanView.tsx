/**
 * Collaboration Hall — Execution Plan View
 *
 * Visualizes plannedExecutionItems with status badges,
 * current-item highlighting, expandable detail, and optional edit mode.
 */
import { useState, useCallback, useEffect } from 'react';
import type { HallTaskCard, HallParticipant, HallExecutionItem } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { PixelAvatar } from './PixelAvatar';

interface ExecutionPlanViewProps {
  taskCard: HallTaskCard;
  participants: HallParticipant[];
  onSelectItem?: (item: HallExecutionItem) => void;
  /** When true, items can be reordered, edited, and deleted */
  editable?: boolean;
  /** Called with updated items when user saves edits */
  onSave?: (items: HallExecutionItem[]) => void;
  /** Controlled editing state. If provided, component works in controlled mode. */
  editing?: boolean;
  /** Called when editing state changes (controlled mode) */
  onEditingChange?: (editing: boolean) => void;
}

type ItemStatus = 'pending' | 'active' | 'completed' | 'handed_off';

function inferItemStatus(
  item: HallExecutionItem,
  taskCard: HallTaskCard,
  index: number,
): ItemStatus {
  const currentId = taskCard.currentExecutionItem?.itemId;
  if (currentId === item.itemId) return 'active';

  // Find the index of current execution item
  const currentIndex = taskCard.plannedExecutionItems.findIndex(
    (i) => i.itemId === currentId,
  );

  // If current item exists and this item comes before it, it's completed or handed off
  if (currentIndex >= 0 && index < currentIndex) {
    // Check if this item had a handoff target → handed_off
    return item.handoffToParticipantId ? 'handed_off' : 'completed';
  }

  return 'pending';
}

function StatusBadge({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="outline" className="gap-0.5 border-primary text-primary text-[11px]">
          <CircleDot className="h-2.5 w-2.5" /> 执行中
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="gap-0.5 border-emerald-200 text-emerald-700 bg-emerald-50 text-[11px]">
          <CheckCircle2 className="h-2.5 w-2.5" /> 已完成
        </Badge>
      );
    case 'handed_off':
      return (
        <Badge variant="outline" className="gap-0.5 border-blue-200 text-blue-700 bg-blue-50 text-[11px]">
          <ArrowRightLeft className="h-2.5 w-2.5" /> 已移交
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-0.5 text-muted-foreground text-[11px]">
          <Clock className="h-2.5 w-2.5" /> 待执行
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
//  Editable item row
// ---------------------------------------------------------------------------

interface EditableItemProps {
  item: HallExecutionItem;
  index: number;
  total: number;
  participants: HallParticipant[];
  taskCard: HallTaskCard;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onChange: (updated: HallExecutionItem) => void;
}

function EditableItemRow({
  item,
  index,
  total,
  participants,
  taskCard,
  onMoveUp,
  onMoveDown,
  onDelete,
  onChange,
}: EditableItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTask, setEditTask] = useState(item.task);
  const [editHandoff, setEditHandoff] = useState(item.handoffToParticipantId ?? '');
  const [editHandoffWhen, setEditHandoffWhen] = useState(item.handoffWhen ?? '');
  const status = inferItemStatus(item, taskCard, index);
  const participant = participants.find((p) => p.participantId === item.participantId);

  const handleSave = useCallback(() => {
    const updated: HallExecutionItem = {
      ...item,
      task: editTask.trim() || item.task,
      handoffToParticipantId: editHandoff || undefined,
      handoffWhen: editHandoffWhen || undefined,
    };
    onChange(updated);
    setEditing(false);
  }, [item, editTask, editHandoff, editHandoffWhen, onChange]);

  const handleCancel = useCallback(() => {
    setEditTask(item.task);
    setEditHandoff(item.handoffToParticipantId ?? '');
    setEditHandoffWhen(item.handoffWhen ?? '');
    setEditing(false);
  }, [item]);

  return (
    <div
      className={cn(
        'group rounded-md border text-xs transition-colors',
        status === 'active'
          ? 'border-primary/30 bg-primary/5'
          : 'bg-background',
      )}
    >
      <div className="flex items-start gap-1.5 p-2">
        {/* Drag handle + move buttons */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
          <button
            type="button"
            className={cn('text-muted-foreground hover:text-foreground', index === 0 && 'opacity-30 pointer-events-none')}
            onClick={onMoveUp}
            aria-label="上移"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={cn('text-muted-foreground hover:text-foreground', index === total - 1 && 'opacity-30 pointer-events-none')}
            onClick={onMoveDown}
            aria-label="下移"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        {/* Step number */}
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            status === 'active'
              ? 'bg-primary text-primary-foreground'
              : status === 'completed' || status === 'handed_off'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {status === 'completed' || status === 'handed_off' ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            index + 1
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <PixelAvatar
              participantId={item.participantId}
              role={participant?.semanticRole}
              size={16}
              className="h-4 w-4 rounded-full"
            />
            <span className="font-medium">
              {participant?.displayName ?? item.participantId}
            </span>
            <StatusBadge status={status} />
          </div>

          {editing ? (
            <div className="space-y-1.5 pt-1">
              <textarea
                className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary resize-none"
                rows={2}
                value={editTask}
                onChange={(e) => setEditTask(e.target.value)}
                placeholder="任务描述"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">移交给:</span>
                <select
                  className="flex-1 rounded border bg-background px-1 py-0.5 text-xs outline-none"
                  value={editHandoff}
                  onChange={(e) => setEditHandoff(e.target.value)}
                >
                  <option value="">（无）</option>
                  {participants.map((p) => (
                    <option key={p.participantId} value={p.participantId}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </div>
              {editHandoff && (
                <input
                  className="w-full rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-primary"
                  value={editHandoffWhen}
                  onChange={(e) => setEditHandoffWhen(e.target.value)}
                  placeholder="移交条件（可选）"
                />
              )}
              <div className="flex justify-end gap-1 pt-0.5">
                <Button variant="ghost" size="sm" className="h-5 text-[11px] px-1.5" onClick={handleCancel}>
                  <X className="h-2.5 w-2.5" />
                </Button>
                <Button size="sm" className="h-5 text-[11px] px-1.5" onClick={handleSave}>
                  <Save className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">{item.task}</p>
              {item.handoffToParticipantId && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  移交 → {participants.find((p) => p.participantId === item.handoffToParticipantId)?.displayName ?? item.handoffToParticipantId}
                  {item.handoffWhen && ` (${item.handoffWhen})`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!editing && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5"
              onClick={() => setEditing(true)}
              aria-label="编辑"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive p-0.5"
            onClick={onDelete}
            aria-label="删除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Read-only item row (original)
// ---------------------------------------------------------------------------

function ExecutionPlanItem({
  item,
  index,
  taskCard,
  participants,
  onSelect,
}: {
  item: HallExecutionItem;
  index: number;
  taskCard: HallTaskCard;
  participants: HallParticipant[];
  onSelect?: (item: HallExecutionItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(false);
  const [editTask, setEditTask] = useState(item.task);
  const status = inferItemStatus(item, taskCard, index);
  const participant = participants.find((p) => p.participantId === item.participantId);
  const handoffParticipant = item.handoffToParticipantId
    ? participants.find((p) => p.participantId === item.handoffToParticipantId)
    : undefined;

  const isClickable = onSelect !== undefined;

  return (
    <div
      className={cn(
        'group rounded-md border text-xs transition-colors',
        status === 'active'
          ? 'border-primary/30 bg-primary/5'
          : 'bg-background',
        isClickable && 'cursor-pointer hover:bg-accent/50',
      )}
      onClick={() => {
        if (isClickable) onSelect(item);
        setExpanded((v) => !v);
      }}
    >
      <div className="flex items-start gap-2.5 p-2">
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            status === 'active'
              ? 'bg-primary text-primary-foreground'
              : status === 'completed' || status === 'handed_off'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {status === 'completed' || status === 'handed_off' ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            index + 1
          )}
        </div>

        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <PixelAvatar
              participantId={item.participantId}
              role={participant?.semanticRole}
              size={16}
              className="h-4 w-4 rounded-full"
            />
            <span className="font-medium">
              {participant?.displayName ?? item.participantId}
            </span>
            <StatusBadge status={status} />
          </div>
          {inlineEdit ? (
            <textarea
              className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary resize-none"
              rows={2}
              value={editTask}
              onChange={(e) => setEditTask(e.target.value)}
              autoFocus
              onBlur={() => {
                setInlineEdit(false);
                setEditTask(item.task);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  setInlineEdit(false);
                }
                if (e.key === 'Escape') {
                  setInlineEdit(false);
                  setEditTask(item.task);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p
              className="text-muted-foreground cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setInlineEdit(true);
              }}
            >
              {item.task}
            </p>
          )}
          {item.handoffToParticipantId && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ArrowRightLeft className="h-2.5 w-2.5" />
              移交 → {handoffParticipant?.displayName ?? item.handoffToParticipantId}
              {item.handoffWhen && ` (${item.handoffWhen})`}
            </div>
          )}
        </div>

        <button
          type="button"
          className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-1">
            <span>步骤 ID: {item.itemId}</span>
            <span>参与者: {item.participantId}</span>
            {item.handoffToParticipantId && (
              <>
                <span>移交目标: {item.handoffToParticipantId}</span>
                {item.handoffWhen && <span>移交条件: {item.handoffWhen}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function ExecutionPlanView({
  taskCard,
  participants,
  onSelectItem,
  editable = false,
  onSave,
  editing,
  onEditingChange,
}: ExecutionPlanViewProps) {
  const [internalEditMode, setInternalEditMode] = useState(false);
  const [editItems, setEditItems] = useState<HallExecutionItem[]>([]);

  // Support both controlled and uncontrolled editing mode
  const isControlled = editing !== undefined;
  const isEditing = isControlled ? editing : internalEditMode;

  // Auto-initialize editItems when entering edit mode (controlled or uncontrolled)
  useEffect(() => {
    if (isEditing) {
      setEditItems([...taskCard.plannedExecutionItems]);
    } else {
      setEditItems([]);
    }
  }, [isEditing, taskCard.plannedExecutionItems]);

  const enterEditMode = useCallback(() => {
    if (isControlled) {
      onEditingChange?.(true);
    } else {
      setInternalEditMode(true);
    }
  }, [isControlled, onEditingChange]);

  const cancelEditMode = useCallback(() => {
    if (isControlled) {
      onEditingChange?.(false);
    } else {
      setInternalEditMode(false);
    }
  }, [isControlled, onEditingChange]);

  const handleSave = useCallback(() => {
    onSave?.(editItems);
    if (isControlled) {
      onEditingChange?.(false);
    } else {
      setInternalEditMode(false);
    }
  }, [editItems, onSave, isControlled, onEditingChange]);

  const handleMoveUp = useCallback((index: number) => {
    setEditItems((prev) => {
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setEditItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleDelete = useCallback((index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleChange = useCallback((index: number, updated: HallExecutionItem) => {
    setEditItems((prev) => prev.map((item, i) => (i === index ? updated : item)));
  }, []);

  const handleAddItem = useCallback(() => {
    setEditItems((prev) => {
      const firstParticipant = participants.find((p) => p.active && !p.isHuman);
      const newItem: HallExecutionItem = {
        itemId: `item-${Date.now()}`,
        participantId: firstParticipant?.participantId ?? 'system',
        task: '新步骤',
      };
      return [...prev, newItem];
    });
  }, [participants]);

  const displayItems = isEditing ? editItems : taskCard.plannedExecutionItems;

  if ((!taskCard.plannedExecutionItems || taskCard.plannedExecutionItems.length === 0) && !isEditing) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        暂无执行计划
      </div>
    );
  }
  const completedCount = taskCard.plannedExecutionItems.filter((item, idx) => {
    const status = inferItemStatus(item, taskCard, idx);
    return status === 'completed' || status === 'handed_off';
  }).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">执行计划</h4>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {completedCount}/{taskCard.plannedExecutionItems.length} 已完成
          </span>
          {editable && !isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[11px] px-1.5"
              onClick={enterEditMode}
            >
              <Pencil className="h-2.5 w-2.5" />
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="ghost" size="sm" className="h-5 text-[11px] px-1.5" onClick={cancelEditMode}>
                取消
              </Button>
              <Button size="sm" className="h-5 text-[11px] px-1.5" onClick={handleSave}>
                <Save className="h-2.5 w-2.5 mr-0.5" /> 保存
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {isEditing ? (
          <>
            {editItems.length === 0 && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                点击下方按钮添加执行步骤
              </div>
            )}
            {editItems.map((item, idx) => (
              <EditableItemRow
                key={item.itemId}
                item={item}
                index={idx}
                total={editItems.length}
                participants={participants}
                taskCard={taskCard}
                onMoveUp={() => handleMoveUp(idx)}
                onMoveDown={() => handleMoveDown(idx)}
                onDelete={() => handleDelete(idx)}
                onChange={(updated) => handleChange(idx, updated)}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleAddItem}
            >
              <Plus className="mr-1 h-3 w-3" />
              添加步骤
            </Button>
          </>
        ) : (
          displayItems.map((item, idx) => (
            <ExecutionPlanItem
              key={item.itemId}
              item={item}
              index={idx}
              taskCard={taskCard}
              participants={participants}
              onSelect={onSelectItem}
            />
          ))
        )}
      </div>
    </div>
  );
}
