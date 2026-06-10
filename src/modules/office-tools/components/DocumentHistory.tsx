/**
 * DocumentHistory — Session history sidebar/list for document processor
 */
import { useEffect } from 'react';
import {
  Clock,
  Trash2,
  Upload,
  Type,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDocumentStore } from '../stores/documentStore';
import type { DocumentSession } from '../types';

interface DocumentHistoryProps {
  onLoadSession?: (session: DocumentSession) => void;
}

const statusIcon: Record<string, React.ReactNode> = {
  idle: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  ocr: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  desensitize: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  refine: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

const statusLabel: Record<string, string> = {
  idle: '待处理',
  ocr: 'OCR识别中',
  desensitize: '脱敏中',
  refine: 'AI优化中',
  done: '已完成',
  error: '处理失败',
};

export function DocumentHistory({ onLoadSession }: DocumentHistoryProps) {
  const sessions = useDocumentStore((s) => s.sessions);
  const fetchSessions = useDocumentStore((s) => s.fetchSessions);
  const deleteSession = useDocumentStore((s) => s.deleteSession);
  const deleteAllSessions = useDocumentStore((s) => s.deleteAllSessions);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/30 py-8 px-4">
        <Clock className="h-6 w-6 text-muted-foreground/30" />
        <p className="mt-2 text-xs text-muted-foreground">暂无处理记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          历史记录 ({sessions.length})
        </div>
        {sessions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
                void deleteAllSessions();
              }
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            清空
          </Button>
        )}
      </div>

      <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onLoadSession?.(session)}
            className={cn(
              'group w-full flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              'hover:bg-muted/50 hover:border-border'
            )}
          >
            <div className="mt-0.5 shrink-0">
              {session.sourceType === 'upload' ? (
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground truncate">
                  {session.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {statusIcon[session.status]}
                <span className="text-[10px] text-muted-foreground">{statusLabel[session.status]}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto">
                  {new Date(session.updatedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
            <div
              className="shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                void deleteSession(session.id);
              }}
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
