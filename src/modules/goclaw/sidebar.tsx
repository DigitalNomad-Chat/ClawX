/**
 * GoClaw 内部侧边栏
 * - 顶部导航：Agent广场 / 历史记录 / 模型配置
 * - 中部：可折叠的最近对话列表（按Agent分组）
 * - 支持折叠收起
 * 视觉风格：学习 AgentSidebar（人设管理）的扁平紧凑工作面板风格
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Store,
  History,
  Cpu,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  Trash2,
  Search,
  Bot,
  X,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGoClawStore, type GoClawSession } from './store';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}

function NavItem({ to, icon, label, collapsed }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

  const link = (
    <NavLink
      to={to}
      className={cn(
        'flex items-center text-sm font-medium transition-colors relative group',
        collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full" />
      )}
      <div className={cn('flex shrink-0 items-center justify-center opacity-70', isActive && 'opacity-100')}>
        {icon}
      </div>
      {!collapsed && (
        <span className={cn('flex-1 overflow-hidden text-ellipsis whitespace-nowrap', isActive && 'font-semibold')}>
          {label}
        </span>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export function GoClawSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnChat = location.pathname.startsWith('/agent-chat');

  const collapsed = useGoClawStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useGoClawStore((s) => s.toggleSidebar);
  const agents = useGoClawStore((s) => s.agents);
  const recentSessions = useGoClawStore((s) => s.recentSessions);
  const sessionsLoading = useGoClawStore((s) => s.sessionsLoading);
  const expandedAgentGroups = useGoClawStore((s) => s.expandedAgentGroups);
  const toggleAgentGroup = useGoClawStore((s) => s.toggleAgentGroup);
  const loadAgents = useGoClawStore((s) => s.loadAgents);
  const loadRecentSessions = useGoClawStore((s) => s.loadRecentSessions);
  const deleteSession = useGoClawStore((s) => s.deleteSession);
  const clearAgentSessions = useGoClawStore((s) => s.clearAgentSessions);

  const [searchQuery, setSearchQuery] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<{ sessionId: string; title: string } | null>(null);
  const [agentToClear, setAgentToClear] = useState<{ agentId: string; name: string } | null>(null);

  useEffect(() => {
    void loadAgents();
    void loadRecentSessions();
  }, [loadAgents, loadRecentSessions]);

  const agentNameMap = useMemo(() => {
    return Object.fromEntries(agents.map((a) => [a.id, a]));
  }, [agents]);

  const groupedSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? recentSessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.agentName.toLowerCase().includes(q) ||
            (agentNameMap[s.agentId]?.tags || []).some((t) => t.toLowerCase().includes(q))
        )
      : recentSessions;

    const map = new Map<string, GoClawSession[]>();
    for (const s of filtered) {
      if (!map.has(s.agentId)) map.set(s.agentId, []);
      map.get(s.agentId)!.push(s);
    }
    const arr = Array.from(map.entries()).map(([agentId, sessions]) => ({
      agentId,
      agentName: agentNameMap[agentId]?.name || sessions[0]?.agentName || agentId,
      agentEmoji: agentNameMap[agentId]?.emoji || sessions[0]?.agentEmoji || '🤖',
      sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt),
      latestAt: Math.max(...sessions.map((s) => s.updatedAt)),
    }));
    return arr.sort((a, b) => b.latestAt - a.latestAt);
  }, [recentSessions, agentNameMap, searchQuery]);

  const navItems = [
    { to: '/goclaw/marketplace', icon: <Store className="h-4 w-4" strokeWidth={2} />, label: '应用广场' },
    { to: '/goclaw/manager', icon: <Shield className="h-4 w-4" strokeWidth={2} />, label: '龙虾管家' },
    { to: '/goclaw/history', icon: <History className="h-4 w-4" strokeWidth={2} />, label: '历史记录' },
    { to: '/goclaw/models', icon: <Cpu className="h-4 w-4" strokeWidth={2} />, label: '模型配置' },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-testid="goclaw-sidebar"
        className={cn(
          'flex min-h-0 shrink-0 flex-col overflow-hidden bg-muted/30 border-r',
          collapsed ? 'w-14' : 'w-60'
        )}
      >
      {/* Header */}
      <div className={cn(
        'border-b bg-muted/50',
        collapsed ? 'flex flex-col items-center gap-1 py-2 px-0' : 'flex items-center justify-between px-3 py-2.5'
      )}>
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">
            超级助手
          </span>
        )}
        {collapsed && <Bot className="h-5 w-5 text-primary shrink-0" />}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => toggleSidebar()}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Top Nav */}
      <nav className="shrink-0 flex flex-col">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Session List Header + Search */}
      {!collapsed && (
        <>
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>最近对话</span>
            {sessionsLoading && <span className="text-[10px] font-normal normal-case tracking-normal">加载中...</span>}
          </div>

          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索历史..."
                className="w-full bg-transparent border-b border-border/60 pl-7 pr-6 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3 w-3 text-muted-foreground/60 hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Grouped Sessions */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-0.5">
            {groupedSessions.length === 0 && !sessionsLoading && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                {searchQuery ? '未找到匹配的历史记录' : '暂无历史对话'}
              </div>
            )}
            {groupedSessions.map((group) => {
              const isExpanded = expandedAgentGroups[group.agentId] !== false;
              const hasActiveSession = isOnChat && location.pathname.includes(`/agent-chat/${group.agentId}`);
              return (
                <div key={group.agentId}>
                  {/* Group Header */}
                  <div
                    onClick={() => toggleAgentGroup(group.agentId)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors group cursor-pointer select-none',
                      hasActiveSession
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform duration-150',
                        isExpanded && 'rotate-90'
                      )}
                    />
                    <span className="truncate">{group.agentEmoji} {group.agentName}</span>
                    <span className={cn(
                      'text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center ml-auto transition-colors',
                      hasActiveSession
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      {group.sessions.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAgentToClear({ agentId: group.agentId, name: group.agentName });
                      }}
                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded p-0.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-opacity shrink-0"
                      title="清空该Agent的历史"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Sessions */}
                  {isExpanded && (
                    <div className="pl-5 pr-1 space-y-px">
                      {group.sessions.map((s) => {
                        const isActive = isOnChat && location.pathname === `/agent-chat/${s.agentId}` && location.search.includes(s.sessionId);
                        return (
                          <div key={s.sessionId} className="group/session relative flex items-center">
                            <button
                              onClick={() => navigate(`/agent-chat/${s.agentId}`, { state: { restoreSessionId: s.sessionId } })}
                              className={cn(
                                'w-full text-left py-1.5 px-2 text-xs transition-colors relative',
                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                              )}
                            >
                              {isActive && (
                                <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-r-full" />
                              )}
                              <span className="truncate block">{s.title}</span>
                              <span className="text-[10px] text-muted-foreground/60">
                                {new Date(s.updatedAt).toLocaleDateString('zh-CN')} · {s.messageCount} 条
                              </span>
                            </button>
                            <button
                              aria-label="删除会话"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSessionToDelete({ sessionId: s.sessionId, title: s.title });
                              }}
                              className={cn(
                                'absolute right-0 flex items-center justify-center rounded p-0.5 transition-opacity duration-150',
                                'opacity-0 group-hover/session:opacity-100',
                                'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10'
                              )}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Stats */}
          {agents.length > 0 && (
            <div className="px-3 py-2 border-t text-[11px] text-muted-foreground shrink-0">
              共 {agents.length} 个 Agent · {recentSessions.length} 条会话
            </div>
          )}
        </>
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
          await deleteSession(sessionToDelete.sessionId);
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />

      <ConfirmDialog
        open={!!agentToClear}
        title="清空历史"
        message={`确定要清空 ${agentToClear?.name || ''} 的所有历史对话吗？该 Agent 的 ${groupedSessions.find((g) => g.agentId === agentToClear?.agentId)?.sessions.length || 0} 条会话将被永久删除。`}
        confirmLabel="清空"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={async () => {
          if (!agentToClear) return;
          await clearAgentSessions(agentToClear.agentId);
          setAgentToClear(null);
        }}
        onCancel={() => setAgentToClear(null)}
      />
      </aside>
    </TooltipProvider>
  );
}
