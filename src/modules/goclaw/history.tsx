/**
 * GoClaw - 历史记录页面
 * 查看、搜索、筛选、删除、导出独立内核的历史对话
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  Search,
  Trash2,
  MessageSquare,
  Download,
  Filter,
  X,
  ChevronRight,
  Bot,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { kernelClient } from '@/lib/kernel-client';
import { useGoClawStore } from './store';

interface HistorySession {
  sessionId: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
}

export function GoClawHistory() {
  const navigate = useNavigate();
  const agents = useGoClawStore((s) => s.agents);
  const loadAgents = useGoClawStore((s) => s.loadAgents);
  const storeSessions = useGoClawStore((s) => s.recentSessions);
  const loadStoreSessions = useGoClawStore((s) => s.loadRecentSessions);

  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt'>('updatedAt');

  const clearAgentSessions = useGoClawStore((s) => s.clearAgentSessions);

  const [sessionToDelete, setSessionToDelete] = useState<HistorySession | null>(null);
  const [agentToClear, setAgentToClear] = useState<{ agentId: string; name: string } | null>(null);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Prefer full raw sessions for export
        const result = await kernelClient.listHistory();
        if (result.success && result.sessions) {
          const mapped = result.sessions.map((s) => ({
            sessionId: s.sessionId,
            agentId: s.agentId,
            agentName: s.agentName,
            agentEmoji: s.agentEmoji,
            title: s.title,
            messages: s.messages,
            createdAt: s.createdAt || s.updatedAt,
            updatedAt: s.updatedAt,
          }));
          setSessions(mapped);
        } else {
          setSessions([]);
        }
      } catch (err) {
        console.error('[GoClawHistory] Failed to load history:', err);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [storeSessions.length]);

  const agentOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; emoji: string; count: number }>();
    for (const s of sessions) {
      const existing = map.get(s.agentId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(s.agentId, {
          id: s.agentId,
          name: s.agentName,
          emoji: s.agentEmoji,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...sessions];

    if (selectedAgentFilter !== 'all') {
      list = list.filter((s) => s.agentId === selectedAgentFilter);
    }

    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.agentName.toLowerCase().includes(q) ||
          JSON.stringify(s.messages).toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => b[sortBy] - a[sortBy]);
    return list;
  }, [sessions, selectedAgentFilter, searchQuery, sortBy]);

  async function handleDelete(sessionId: string) {
    try {
      const result = await kernelClient.deleteHistory(sessionId);
      if (result.success) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        await loadStoreSessions();
      }
    } catch (err) {
      console.error('[GoClawHistory] Delete failed:', err);
    }
  }

  async function handleClearAgent(agentId: string) {
    try {
      const ok = await clearAgentSessions(agentId);
      if (ok) {
        setSessions((prev) => prev.filter((s) => s.agentId !== agentId));
        await loadStoreSessions();
      }
    } catch (err) {
      console.error('[GoClawHistory] Clear agent failed:', err);
    }
  }

  function handleExport(session: HistorySession) {
    const payload = {
      sessionId: session.sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goclaw-${session.agentName}-${session.sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportAll() {
    const payload = {
      exportedAt: Date.now(),
      total: filteredSessions.length,
      sessions: filteredSessions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goclaw-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">历史记录</h1>
            <p className="text-sm text-muted-foreground">
              查看和管理您与 Agent 的对话历史
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportAll} disabled={filteredSessions.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            导出全部
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索历史会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Badge
            variant={selectedAgentFilter === 'all' ? 'default' : 'secondary'}
            className="cursor-pointer text-xs"
            onClick={() => setSelectedAgentFilter('all')}
          >
            全部
          </Badge>
          {agentOptions.map((agent) => (
            <Badge
              key={agent.id}
              variant={selectedAgentFilter === agent.id ? 'default' : 'secondary'}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedAgentFilter(agent.id)}
            >
              {agent.emoji} {agent.name} ({agent.count})
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">排序:</span>
          <button
            onClick={() => setSortBy('updatedAt')}
            className={cn(
              'text-xs px-2 py-1 rounded-md border transition-colors',
              sortBy === 'updatedAt'
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-muted/50 border-border hover:bg-muted'
            )}
          >
            最近更新
          </button>
          <button
            onClick={() => setSortBy('createdAt')}
            className={cn(
              'text-xs px-2 py-1 rounded-md border transition-colors',
              sortBy === 'createdAt'
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-muted/50 border-border hover:bg-muted'
            )}
          >
            创建时间
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="总会话" value={sessions.length} />
        <StatCard icon={<Bot className="h-4 w-4" />} label="Agent 数量" value={agentOptions.length} />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="筛选后"
          value={filteredSessions.length}
        />
        <StatCard
          icon={<Download className="h-4 w-4" />}
          label="可导出"
          value={filteredSessions.length > 0 ? '是' : '否'}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          加载历史记录...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <History className="h-8 w-8" />
          <p>{searchQuery || selectedAgentFilter !== 'all' ? '未找到匹配的会话' : '暂无历史对话'}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {filteredSessions.map((session) => {
            const agent = agents.find((a) => a.id === session.agentId);
            return (
              <div
                key={session.sessionId}
                className={cn(
                  'group flex items-start gap-4 rounded-xl border bg-card p-4 transition-all',
                  'hover:shadow-md hover:border-primary/30'
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl">
                  {session.agentEmoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{session.title}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {agent?.name || session.agentName}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(session.updatedAt).toLocaleString('zh-CN')} · {session.messages.length} 条消息
                    {session.createdAt !== session.updatedAt && (
                      <>
                        {' · 创建于 '}{new Date(session.createdAt).toLocaleString('zh-CN')}
                      </>
                    )}
                  </p>
                  {agent?.tags && agent.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {agent.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/agent-chat/${session.agentId}`, { state: { restoreSessionId: session.sessionId } })}
                  >
                    <ChevronRight className="h-4 w-4 mr-1" />
                    继续
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleExport(session)}
                    title="导出"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setSessionToDelete(session)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!sessionToDelete}
        title="删除会话"
        message={`确定要删除会话 "${sessionToDelete?.title}" 吗？此操作不可恢复。`}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await handleDelete(sessionToDelete.sessionId);
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />

      <ConfirmDialog
        open={!!agentToClear}
        title="清空 Agent 历史"
        message={`确定要清空 ${agentToClear?.name || ''} 的所有历史对话吗？该 Agent 的所有历史会话将被永久删除，此操作不可恢复。`}
        confirmLabel="清空"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={async () => {
          if (!agentToClear) return;
          await handleClearAgent(agentToClear.agentId);
          setAgentToClear(null);
        }}
        onCancel={() => setAgentToClear(null)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
