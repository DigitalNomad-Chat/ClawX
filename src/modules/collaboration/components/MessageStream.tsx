/**
 * Collaboration Hall — Message Stream with SSE
 *
 * Replaces the static message list with a real-time streaming view.
 * Integrates useCollabStream for draft/finalize/abort events.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCollaborationStore } from '../store';
import { useCollabStream } from '../hooks/useCollabStream';
import type { HallMessage, HallParticipant, HallTaskCard } from '../types';
import { MentionInput } from './MentionInput';
import {
  MessageSquare,
  RefreshCw,
  Send,
  Bot,
  ChevronRight,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ROLE_COLORS: Record<string, string> = {
  planner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  coder: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  reviewer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  generalist: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
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
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
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

  return (
    <div
      className={cn('flex gap-3 py-3', isSelf ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {isHandoff ? (
          <ChevronRight className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
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
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
            isHandoff
              ? 'border border-primary/20 bg-primary/5'
              : 'bg-muted'
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function DraftMessageItem({ draft }: { draft: DraftItem }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
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
          <span className="text-[10px] text-muted-foreground">生成中…</span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
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
          <p className="text-[10px] text-destructive">
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
}

export function MessageStream({
  hallId,
  currentParticipant,
  participants,
  selectedTaskCardId,
  selectedTaskCard,
  onSelectTaskCard,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ---------- SSE integration ---------- */
  const handleDraftChunk = useCallback(
    (draftId: string, chunk: string) => {
      setDrafts((prev) => {
        const existing = prev[draftId];
        if (existing) {
          return {
            ...prev,
            [draftId]: { ...existing, content: existing.content + chunk },
          };
        }
        // New draft — attempt to infer author from active taskCard / last message
        return {
          ...prev,
          [draftId]: {
            draftId,
            authorLabel: 'Agent',
            content: chunk,
            status: 'streaming',
            createdAt: Date.now(),
          },
        };
      });
    },
    []
  );

  const handleDraftFinalize = useCallback(
    (draftId: string, message: HallMessage) => {
      setDrafts((prev) => {
        const copy = { ...prev };
        if (copy[draftId]) {
          copy[draftId] = { ...copy[draftId], status: 'finalized', finalizedMessageId: message.messageId };
        }
        return copy;
      });
      // Persist the finalized message into the store via a lightweight refresh
      // (The backend already persisted it; we just re-fetch to stay in sync)
      void fetchMessages({ taskCardId: selectedTaskCardId || undefined, limit: 200 });
    },
    [fetchMessages, selectedTaskCardId]
  );

  const handleDraftAbort = useCallback((draftId: string, reason: string) => {
    setDrafts((prev) => {
      const existing = prev[draftId];
      if (!existing) return prev;
      return {
        ...prev,
        [draftId]: { ...existing, status: 'aborted', abortedReason: reason },
      };
    });
  }, []);

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
    await sendMessage({
      content: input.trim(),
      authorParticipantId: currentParticipant.participantId,
      authorLabel: currentParticipant.displayName,
      kind: 'chat',
      taskCardId: selectedTaskCardId || undefined,
    });
    setInput('');
    setSending(false);
  }, [input, sending, sendMessage, currentParticipant, selectedTaskCardId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card">
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
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
              <WifiOff className="mr-1 h-3 w-3" />
              离线
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filteredMessages.length === 0 && activeDrafts.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无消息
          </div>
        )}
        {filteredMessages.map((msg) => (
          <StreamMessageItem
            key={msg.messageId}
            message={msg}
            isSelf={msg.authorParticipantId === currentParticipant.participantId}
          />
        ))}
        {activeDrafts.map((draft) => (
          <DraftMessageItem key={draft.draftId} draft={draft} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <MentionInput
            participants={participants}
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            placeholder={
              selectedTaskCard
                ? '回复任务... 使用 @名字 提及参与者'
                : '发送消息... 使用 @名字 提及参与者'
            }
            disabled={sending}
          />
          <Button
            size="icon"
            className="h-auto shrink-0"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
