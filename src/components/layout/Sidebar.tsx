/**
 * Sidebar Component
 * Navigation sidebar with menu items.
 * No longer fixed - sits inside the flex layout below the title bar.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Network,
  Bot,
  Puzzle,
  Clock,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Terminal,
  ExternalLink,
  Trash2,
  Cpu,
  Moon,
  Store,
  ChevronRight,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { rendererExtensionRegistry } from '@/extensions/registry';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { groupSessionsByAgent } from './session-buckets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hostApiFetch } from '@/lib/host-api';
import { useTranslation } from 'react-i18next';
import { moduleNavItems } from '@/modules/registry';
import logoSvg from '@/assets/logo.svg';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  collapsed?: boolean;
  onClick?: () => void;
  testId?: string;
}

function NavItem({ to, icon, label, badge, collapsed, onClick, testId }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      data-testid={testId}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200',
          'hover:bg-primary/5 dark:hover:bg-primary/8 text-foreground/80',
          isActive
            ? 'bg-gradient-to-r from-primary/10 to-transparent !text-foreground/80 border-l-[3px] border-l-primary'
            : 'border-l-[3px] border-l-transparent',
          collapsed && 'justify-center px-0 border-l-0'
        )
      }
    >
      {({ isActive }) => (
        <div data-nav-item data-active={isActive || undefined} className="flex items-center gap-2.5 w-full">
          <div className={cn("flex shrink-0 items-center justify-center", isActive ? "!text-foreground/80" : "text-muted-foreground")}>
            {icon}
          </div>
          {!collapsed && (
            <>
              <span className={cn("flex-1 overflow-hidden text-ellipsis whitespace-nowrap", isActive && "font-semibold")}>{label}</span>
              {badge && (
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {badge}
                </Badge>
              )}
            </>
          )}
        </div>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';
  const isGatewayReady = isGatewayRunning && gatewayStatus.gatewayReady !== false;

  useEffect(() => {
    if (!isGatewayReady) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await Promise.allSettled([
        loadSessions(),
        loadHistory(hasExistingMessages),
      ]);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayReady, loadHistory, loadSessions]);
  const agents = useAgentsStore((s) => s.agents);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const openControlUi = async (path: string, label: string) => {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        url?: string;
        error?: string;
      }>(path);
      if (result.success && result.url) {
        await window.electron.openExternal(result.url);
      } else {
        console.error(`Failed to get ${label} URL:`, result.error);
      }
    } catch (err) {
      console.error(`Error opening ${label}:`, err);
    }
  };

  const openDevConsole = async () => {
    await openControlUi('/api/gateway/control-ui', 'OpenClaw Page');
  };

  const { t } = useTranslation(['common', 'chat']);
  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);

  const expandedAgentGroups = useSettingsStore((s) => s.expandedAgentGroups);
  const toggleAgentGroup = useSettingsStore((s) => s.toggleAgentGroup);
  const managementToolsExpanded = useSettingsStore((s) => s.managementToolsExpanded);
  const toggleManagementTools = useSettingsStore((s) => s.toggleManagementTools);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const agentNameById = useMemo(
    () => Object.fromEntries((agents ?? []).map((agent) => [agent.id, agent.name])),
    [agents],
  );
  const agentGroups = useMemo(
    () => groupSessionsByAgent(sessions, sessionLastActivity, agentNameById),
    [sessions, sessionLastActivity, agentNameById],
  );

  const hiddenRoutes = rendererExtensionRegistry.getHiddenRoutes();
  const extraNavItems = rendererExtensionRegistry.getExtraNavItems();

  // Routes shown as top-level persistent nav items
  const TOP_NAV_PATHS = new Set(['/marketplace', '/dashboard', '/collaboration']);

  const allNavItems = [
    { to: '/models', icon: <Cpu className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.models'), testId: 'sidebar-nav-models' },
    { to: '/agents', icon: <Bot className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.agents'), testId: 'sidebar-nav-agents' },
    { to: '/channels', icon: <Network className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.channels'), testId: 'sidebar-nav-channels' },
    { to: '/skills', icon: <Puzzle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.skills'), testId: 'sidebar-nav-skills' },
    { to: '/cron', icon: <Clock className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.cronTasks'), testId: 'sidebar-nav-cron' },
    ...(devModeUnlocked
      ? [{ to: '/dreams', icon: <Moon className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('common:sidebar.openClawDreams'), testId: 'sidebar-nav-dreams' }]
      : []),
    { to: '/marketplace', icon: <Store className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.marketplace') || '应用广场', testId: 'sidebar-nav-marketplace' },
    ...moduleNavItems.map((item) => ({
      to: item.to,
      icon: item.icon,
      label: item.i18nKey ? t(item.i18nKey as never) : item.label,
      testId: item.testId,
    })),
    ...extraNavItems.map((item) => ({
      to: item.to,
      icon: <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: item.labelI18nKey ? t(item.labelI18nKey) : item.label,
      testId: item.testId,
    })),
  ].filter((item) => !hiddenRoutes.has(item.to));

  const topNavItems = allNavItems.filter((item) => TOP_NAV_PATHS.has(item.to));
  const managementNavItems = allNavItems.filter((item) => !TOP_NAV_PATHS.has(item.to));

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden border-r bg-surface-sidebar/60 transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Top Header Toggle */}
      <div className={cn("flex items-center p-2 h-12", sidebarCollapsed ? "justify-center" : "justify-between")}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 overflow-hidden">
            <img src={logoSvg} alt="ClawX" className="h-5 w-auto shrink-0" />
            <span className="text-sm font-semibold truncate whitespace-nowrap text-foreground/90">
              ClawX
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </Button>
      </div>

      {/* Layer 1: Top persistent nav — new chat + topNavItems */}
      <nav className="flex flex-col px-2 gap-0.5">
        <button
          data-testid="sidebar-new-chat"
          data-nav-item="new-chat"
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate('/');
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-all duration-200 mb-2',
            'bg-primary/8 dark:bg-primary/12 text-primary border border-primary/15 shadow-sm',
            'hover:bg-primary/12 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-px',
            sidebarCollapsed && 'justify-center px-0',
          )}
        >
          <div className="flex shrink-0 items-center justify-center text-foreground/80">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">{t('sidebar.newChat')}</span>}
        </button>

        {!sidebarCollapsed && topNavItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      {/* Layer 2: Session list — grouped by Agent */}
      {!sidebarCollapsed && (
        <div className="mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-2.5">
          {agentGroups.map((group) => {
            const isExpanded = expandedAgentGroups[group.agentId] !== false;
            return (
              <div
                key={group.agentId}
                data-testid={`agent-group-${group.agentId}`}
                className="rounded-lg bg-secondary/60 dark:bg-card/40 border border-border/40 dark:border-border/30 overflow-hidden"
              >
                {/* Group header — container band */}
                <button
                  onClick={() => toggleAgentGroup(group.agentId)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-200',
                      isExpanded && 'rotate-90'
                    )}
                  />
                  <span className="flex-1 text-left truncate">{group.agentName}</span>
                  <span className="text-2xs tabular-nums text-muted-foreground/55 font-normal normal-case tracking-normal">
                    {group.sessions.length}
                  </span>
                </button>

                {/* Group sessions — indented children */}
                {isExpanded && (
                  <div className="px-1.5 pb-1.5 space-y-px">
                    {group.sessions.map((s) => {
                      const isSessionActive = isOnChat && currentSessionKey === s.key;
                      return (
                        <div key={s.key} className="group relative flex items-center">
                          <button
                            data-session-item
                            data-active={isSessionActive || undefined}
                            onClick={() => { switchSession(s.key); navigate('/'); }}
                            className={cn(
                              'w-full text-left rounded-md px-3 py-1.5 text-meta transition-all duration-150 pr-7',
                              'border-l-2',
                              isSessionActive
                                ? 'bg-primary/10 dark:bg-primary/15 text-foreground font-medium border-l-primary'
                                : 'text-foreground/75 border-l-transparent hover:bg-muted/50 dark:hover:bg-white/[0.04] hover:border-l-muted-foreground/25',
                            )}
                          >
                            <span className="truncate block">{getSessionLabel(s.key, s.displayName, s.label)}</span>
                          </button>
                          <button
                            aria-label="Delete session"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSessionToDelete({
                                key: s.key,
                                label: getSessionLabel(s.key, s.displayName, s.label),
                              });
                            }}
                            className={cn(
                              'absolute right-1.5 flex items-center justify-center rounded p-0.5 transition-opacity duration-150',
                              'opacity-0 group-hover:opacity-100',
                              'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10',
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
      )}

      {/* Layer 3: Management tools (collapsible) */}
      {!sidebarCollapsed && managementNavItems.length > 0 && (
        <div className="px-2 pb-1">
          <button
            onClick={toggleManagementTools}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-foreground rounded-md hover:bg-muted/40 transition-colors"
          >
            <Wrench className="h-3 w-3 shrink-0" />
            <span className="flex-1 text-left">{t('sidebar.managementTools') || '管理工具'}</span>
            <ChevronRight
              className={cn(
                'h-3 w-3 shrink-0 transition-transform duration-200',
                managementToolsExpanded && 'rotate-90'
              )}
            />
          </button>
          {managementToolsExpanded && (
            <nav className="flex flex-col gap-px mt-0.5">
              {managementNavItems.map((item) => (
                <NavItem key={item.to} {...item} collapsed={false} />
              ))}
            </nav>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-2 mt-auto shrink-0">
        <NavLink
            to="/settings"
            data-testid="sidebar-nav-settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200',
                'hover:bg-primary/5 dark:hover:bg-primary/8 text-foreground/80',
                isActive
                  ? 'bg-gradient-to-r from-primary/10 to-transparent !text-foreground/80 border-l-[3px] border-l-primary'
                  : 'border-l-[3px] border-l-transparent',
                sidebarCollapsed ? 'justify-center px-0 border-l-0' : ''
              )
            }
          >
          {({ isActive }) => (
            <div data-nav-item data-active={isActive || undefined} className="flex items-center gap-2.5 w-full">
              <div className={cn("flex shrink-0 items-center justify-center", isActive ? "text-foreground/80" : "text-muted-foreground")}>
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && <span className={cn("flex-1 overflow-hidden text-ellipsis whitespace-nowrap", isActive && "font-semibold")}>{t('sidebar.settings')}</span>}
            </div>
          )}
        </NavLink>

        {devModeUnlocked && (
          <Button
            data-testid="sidebar-open-dev-console"
            variant="ghost"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 h-auto text-sm font-medium transition-colors w-full mt-1',
              'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-start'
            )}
            onClick={openDevConsole}
          >
            <div className="flex shrink-0 items-center justify-center text-muted-foreground">
              <Terminal className="h-[18px] w-[18px]" strokeWidth={2} />
            </div>
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">{t('common:sidebar.openClawPage')}</span>
                <ExternalLink className="h-3 w-3 shrink-0 ml-auto opacity-50 text-muted-foreground" />
              </>
            )}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common:actions.confirm')}
        message={t('common:sidebar.deleteSessionConfirm', { label: sessionToDelete?.label })}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate('/');
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </aside>
  );
}
