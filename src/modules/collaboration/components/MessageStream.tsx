/**
 * Collaboration Hall — Message Stream with SSE
 *
 * Replaces the static message list with a real-time streaming view.
 * Integrates useCollabStream for draft/finalize/abort events.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { useCollaborationStore } from '../store';
import { useCollabStream } from '../hooks/useCollabStream';
import type { HallMessage, HallParticipant, HallTaskCard } from '../types';
import { MentionInput } from './MentionInput';
import { DecisionPanel } from './DecisionPanel';
import { PixelAvatar } from './PixelAvatar';
import {
  MessageSquare,
  RefreshCw,
  Send,
  ChevronRight,
  Loader2,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ROLE_COLORS: Record<string, string> = {
  planner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  coder: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  reviewer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  generalist: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
};

const ROLE_BUBBLE_STYLES: Record<string, string> = {
  planner: 'border-l-2 border-l-blue-400 bg-blue-50/50 shadow-sm dark:bg-blue-950/20',
  coder: 'border-l-2 border-l-emerald-400 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20',
  reviewer: 'border-l-2 border-l-amber-400 bg-amber-50/50 shadow-sm dark:bg-amber-950/20',
  manager: 'border-l-2 border-l-purple-400 bg-purple-50/50 shadow-sm dark:bg-purple-950/20',
  generalist: 'bg-muted shadow-sm',
};

const ROLE_AVATAR_RING: Record<string, string> = {
  planner: 'ring-blue-200 dark:ring-blue-800',
  coder: 'ring-emerald-200 dark:ring-emerald-800',
  reviewer: 'ring-amber-200 dark:ring-amber-800',
  manager: 'ring-purple-200 dark:ring-purple-800',
  generalist: 'ring-border',
};

function RoleBadge({ role }: { role?: string }) {
  const cls = ROLE_COLORS[role || 'generalist'] || ROLE_COLORS.generalist;
  const label =
    role === 'planner'
      ? '策划'
      : role === 'coder'
        ? '执行'
        : role === 'reviewer'
          ? '审核'
          : role === 'manager'
            ? '经理'
            : '通用';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        cls
      )}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
//  Draft item local type
interface DraftItem {
  draftId: string;
  authorLabel: string;
  authorSemanticRole?: string;
  content: string;
  status: 'streaming' | 'finalized' | 'aborted';
  abortedReason?: string;
  finalizedMessageId?: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */

function HandoffPayload({ payload }: { payload?: HallMessage['payload'] }) {
  if (!payload?.handoff) return null;
  const { handoff, handoffValidation } = payload;

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-primary/10 bg-primary/[0.02] p-2 text-xs">
      {handoff.goal && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">目标</span>
          <span className="font-medium">{handoff.goal}</span>
        </div>
      )}
      {handoff.currentResult && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">结果</span>
          <span className="line-clamp-2">{handoff.currentResult}</span>
        </div>
      )}
      {handoff.nextOwner && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">下一负责人</span>
          <span className="font-medium">{handoff.nextOwner}</span>
        </div>
      )}
      {handoff.blockers.length > 0 && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">阻塞</span>
          <span className="text-red-600/80">{handoff.blockers.join('；')}</span>
        </div>
      )}
      {handoffValidation && (
        <div className="mt-1 space-y-1">
          {handoffValidation.valid ? (
            <div className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> 验证通过
            </div>
          ) : (
            <>
              {handoffValidation.errors.map((err, i) => (
                <div key={`e-${i}`} className="flex items-center gap-1 text-[11px] text-red-600">
                  <XCircle className="h-3 w-3" /> {err.message}
                </div>
              ))}
              {handoffValidation.warnings.map((warn, i) => (
                <div key={`w-${i}`} className="flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> {warn.message}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StreamMessageItem({
  message,
  isSelf,
}: {
  message: HallMessage;
  isSelf?: boolean;
}) {
  const isSystem = message.kind === 'system';
  const isHandoff = message.kind === 'handoff';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const bubbleStyle = isHandoff
    ? 'border border-primary/20 bg-primary/5'
    : ROLE_BUBBLE_STYLES[message.authorSemanticRole || 'generalist'] || 'bg-muted shadow-sm';
  const avatarRing = isHandoff
    ? 'ring-border'
    : ROLE_AVATAR_RING[message.authorSemanticRole || 'generalist'] || 'ring-border';

  return (
    <div
      className={cn('flex gap-3 py-3', isSelf ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden ring-2',
        avatarRing
      )}>
        {isHandoff ? (
          <ChevronRight className="h-4 w-4 text-primary" />
        ) : (
          <PixelAvatar
            participantId={message.authorParticipantId}
            role={message.authorSemanticRole}
            size={32}
            className="h-8 w-8"
          />
        )}
      </div>
      <div
        className={cn(
          'max-w-[80%] space-y-1',
          isSelf ? 'items-end text-right' : 'items-start'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{message.authorLabel}</span>
          <RoleBadge role={message.authorSemanticRole} />
          <span className="text-[11px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            bubbleStyle
          )}
        >
          <div className="prose prose-sm max-w-none dark:prose-invert [&_pre]:rounded-md [&_pre]:bg-background [&_pre]:p-2 [&_code]:text-xs [&_code]:before:content-[''] [&_code]:after:content-['']">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        </div>
        {isHandoff && <HandoffPayload payload={message.payload} />}
      </div>
    </div>
  );
}

function DraftMessageItem({ draft }: { draft: DraftItem }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
        {draft.status === 'aborted' ? (
          <WifiOff className="h-4 w-4 text-destructive" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>
      <div className="max-w-[80%] space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{draft.authorLabel}</span>
          <RoleBadge role={draft.authorSemanticRole} />
          <span className="text-[11px] text-muted-foreground">生成中…</span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap shadow-sm',
            draft.status === 'aborted'
              ? 'border border-destructive/20 bg-destructive/5 text-destructive'
              : 'border border-primary/20 bg-primary/5'
          )}
        >
          {draft.content}
          {draft.status === 'streaming' && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-middle" />
          )}
        </div>
        {draft.status === 'aborted' && draft.abortedReason && (
          <p className="text-[11px] text-destructive">
            已中断：{draft.abortedReason}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
//  Props
interface MessageStreamProps {
  hallId?: string;
  currentParticipant: HallParticipant;
  participants: HallParticipant[];
  selectedTaskCardId?: string | null;
  selectedTaskCard?: HallTaskCard | null;
  onSelectTaskCard?: (id: string | null) => void;
  /** Called when a draft chunk arrives — includes authorLabel for member status tracking */
  onDraftChunk?: (draftId: string, chunk: string, authorLabel?: string) => void;
  /** Called when a draft is finalized */
  onDraftFinalize?: (draftId: string, message: HallMessage | undefined, authorLabel?: string) => void;
  /** Called when a draft is aborted */
  onDraftAbort?: (draftId: string, reason: string, authorLabel?: string) => void;
  /** Optional member status bar rendered as a collapsible panel */
  renderMemberBar?: React.ReactNode;
}

export function MessageStream({
  hallId,
  currentParticipant,
  participants,
  selectedTaskCardId,
  selectedTaskCard,
  onSelectTaskCard,
  onDraftChunk: onDraftChunkExternal,
  onDraftFinalize: onDraftFinalizeExternal,
  onDraftAbort: onDraftAbortExternal,
  renderMemberBar,
}: MessageStreamProps) {
  const {
    messages,
    loading,
    fetchOverview,
    fetchMessages,
    sendMessage,
  } = useCollaborationStore();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftItem>>({});
  const [showMemberBar, setShowMemberBar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ---------- SSE integration ---------- */
  const handleDraftChunk = useCallback(
    (draftId: string, chunk: string, extra?: Record<string, unknown>) => {
      // Extract author info from SSE payload
      let authorLabel = extra?.authorLabel as string | undefined;
      // Fallback: parse from "正在思考…" placeholder
      if (!authorLabel) {
        const thinkingMatch = chunk.match(/^(.+?) 正在思考/);
        authorLabel = thinkingMatch?.[1] || undefined;
      }
      const authorSemanticRole = extra?.authorSemanticRole as string | undefined;

      setDrafts((prev) => {
        const existing = prev[draftId];
        if (existing) {
          authorLabel = existing.authorLabel;
          return {
            ...prev,
            [draftId]: { ...existing, content: existing.content + chunk },
          };
        }
        return {
          ...prev,
          [draftId]: {
            draftId,
            authorLabel: authorLabel || 'Agent',
            authorSemanticRole,
            content: chunk,
            status: 'streaming',
            createdAt: Date.now(),
          },
        };
      });
      onDraftChunkExternal?.(draftId, chunk, authorLabel);
    },
    [onDraftChunkExternal]
  );

  const handleDraftFinalize = useCallback(
    (draftId: string, message: HallMessage | undefined, _extra?: Record<string, unknown>) => {
      const draft = drafts[draftId];
      setDrafts((prev) => {
        const copy = { ...prev };
        if (copy[draftId]) {
          copy[draftId] = { ...copy[draftId], status: 'finalized', finalizedMessageId: message?.messageId };
        }
        return copy;
      });
      // Persist the finalized message into the store via a lightweight refresh
      // (The backend already persisted it; we just re-fetch to stay in sync)
      void fetchMessages({ taskCardId: selectedTaskCardId || undefined, limit: 200 });
      onDraftFinalizeExternal?.(draftId, message, draft?.authorLabel);
    },
    [fetchMessages, selectedTaskCardId, onDraftFinalizeExternal, drafts]
  );

  const handleDraftAbort = useCallback((draftId: string, reason: string, _extra?: Record<string, unknown>) => {
    const draft = drafts[draftId];
    setDrafts((prev) => {
      const existing = prev[draftId];
      if (!existing) return prev;
      return {
        ...prev,
        [draftId]: { ...existing, status: 'aborted', abortedReason: reason },
      };
    });
    onDraftAbortExternal?.(draftId, reason, draft?.authorLabel);
  }, [onDraftAbortExternal, drafts]);

  const handleMessageCreated = useCallback(
    (_message: HallMessage) => {
      void fetchMessages({ taskCardId: selectedTaskCardId || undefined, limit: 200 });
    },
    [fetchMessages, selectedTaskCardId]
  );

  const handleTaskUpdated = useCallback(
    (_taskCard: HallTaskCard) => {
      void fetchOverview();
    },
    [fetchOverview]
  );

  const { connected } = useCollabStream({
    hallId,
    onDraftChunk: handleDraftChunk,
    onDraftFinalize: handleDraftFinalize,
    onDraftAbort: handleDraftAbort,
    onMessageCreated: handleMessageCreated,
    onTaskUpdated: handleTaskUpdated,
    onStructuredUpdate: useCallback(
      () => { void fetchOverview(); },
      [fetchOverview],
    ),
    onDiscussionCycleChange: useCallback(
      () => { void fetchOverview(); },
      [fetchOverview],
    ),
    onLockChange: useCallback(
      (_taskCardId: string, lock: { lockId: string; participantId: string; releasedReason?: string }, action: 'acquired' | 'released') => {
        console.log(`[collab] Lock ${action}: taskCard=${_taskCardId} participant=${lock.participantId}${action === 'released' ? ` reason=${lock.releasedReason}` : ''}`);
      },
      [],
    ),
  });

  /* ---------- derived messages ---------- */
  const filteredMessages = useMemo(() => {
    if (!selectedTaskCardId) return messages;
    return messages.filter((m) => m.taskCardId === selectedTaskCardId);
  }, [messages, selectedTaskCardId]);

  const activeDrafts = useMemo(
    () => Object.values(drafts).filter((d) => d.status === 'streaming' || d.status === 'aborted'),
    [drafts]
  );

  /* ---------- auto scroll ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages.length, activeDrafts.length]);

  /* ---------- actions ---------- */
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({
        content: input.trim(),
        authorParticipantId: currentParticipant.participantId,
        authorLabel: currentParticipant.displayName,
        kind: 'chat',
        taskCardId: selectedTaskCardId || undefined,
      });
      setInput('');
      toast.success('消息已发送');
    } catch (err) {
      toast.error(`发送失败: ${String(err)}`);
    } finally {
      setSending(false);
    }
  }, [input, sending, sendMessage, currentParticipant, selectedTaskCardId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-card rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {selectedTaskCard ? selectedTaskCard.title : '大厅消息'}
          </span>
          {selectedTaskCard && onSelectTaskCard && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onSelectTaskCard(null)}
            >
              查看全部
            </Button>
          )}
          {!connected && (
            <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-200">
              <WifiOff className="mr-1 h-3 w-3" />
              离线
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {renderMemberBar && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 gap-1 text-xs px-2 transition-colors',
                showMemberBar && 'bg-accent text-accent-foreground'
              )}
              onClick={() => setShowMemberBar((v) => !v)}
              title="成员状态"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">成员</span>
            </Button>
          )}
          {connected && (
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void fetchOverview()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Collapsible Member Status Bar */}
      <AnimatePresence initial={false}>
        {showMemberBar && renderMemberBar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b bg-card/50"
          >
            {renderMemberBar}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decision Panel — shown when a task card is selected and has structured fields */}
      {selectedTaskCard && (selectedTaskCard.proposal || selectedTaskCard.decision || selectedTaskCard.doneWhen) && (
        <div className="border-b px-4 py-2">
          <DecisionPanel taskCard={selectedTaskCard} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filteredMessages.length === 0 && activeDrafts.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无消息
          </div>
        )}
        <AnimatePresence initial={false}>
          {filteredMessages.filter(Boolean).map((msg) => (
            <motion.div
              key={msg.messageId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <StreamMessageItem
                message={msg}
                isSelf={msg.authorParticipantId === currentParticipant.participantId}
              />
            </motion.div>
          ))}
          {activeDrafts.map((draft) => (
            <motion.div
              key={draft.draftId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DraftMessageItem draft={draft} />
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input — floating style with top shadow */}
      <div className="relative z-10 border-t border-border/30 py-3 px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] backdrop-blur-md bg-background/90">
        <div className="flex items-center gap-3">
          <MentionInput
            participants={participants}
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            placeholder={
              selectedTaskCard
                ? '回复任务...'
                : '发送消息... @提及'
            }
            disabled={sending}
          />
          <Button
            size="icon"
            aria-label="发送消息"
            className="h-11 w-11 shrink-0 rounded-full transition-colors opacity transform duration-200 hover:bg-primary/90 active:scale-95 disabled:opacity-40"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
