/**
 * Chat Toolbar
 * Agent badge (left) + workspace / refresh buttons (right).
 * Rendered at the top of the Chat page.
 */
import { useMemo } from 'react';
import { RefreshCw, Bot, FolderOpen, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/stores/chat';
import { useAgentsStore } from '@/stores/agents';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { WORKSPACE_BROWSER_ENABLED } from '@/components/file-preview/workspace-browser-config';
import { useDesensitizeViewStore } from '@/stores/desensitize-view';

export function ChatToolbar() {
  const refresh = useChatStore((s) => s.refresh);
  const loading = useChatStore((s) => s.loading);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const agents = useAgentsStore((s) => s.agents);
  const openBrowser = useArtifactPanel((s) => s.openBrowser);
  const panelOpen = useArtifactPanel((s) => s.open);
  const panelTab = useArtifactPanel((s) => s.tab);
  const closePanel = useArtifactPanel((s) => s.close);
  const { t } = useTranslation('chat');
  const currentAgent = useMemo(
    () => (agents ?? []).find((agent) => agent.id === currentAgentId) ?? null,
    [agents, currentAgentId],
  );
  const currentAgentName = currentAgent?.name ?? currentAgentId;

  const browserActive = WORKSPACE_BROWSER_ENABLED && panelOpen && panelTab === 'browser';
  const globalShowOriginal = useDesensitizeViewStore((s) => s.globalShowOriginal);
  const toggleGlobal = useDesensitizeViewStore((s) => s.toggleGlobalShowOriginal);

  return (
    <div className="flex w-full items-center justify-between">
      {/* Left: Agent badge */}
      <div className="hidden sm:flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary/8 to-primary/3 dark:from-primary/12 dark:to-primary/5 px-3 py-1.5 text-xs font-medium text-foreground/80 border border-primary/10 dark:border-primary/15 shadow-sm">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 dark:bg-primary/20">
          <Bot className="h-3 w-3 text-primary" />
        </div>
        <span>{t('toolbar.currentAgent', { agent: currentAgentName })}</span>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-1">
        {WORKSPACE_BROWSER_ENABLED && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-lg transition-all duration-200',
                  'hover:bg-foreground/6 dark:hover:bg-white/8',
                  browserActive && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                )}
                onClick={() => (browserActive ? closePanel() : openBrowser())}
                disabled={!currentAgent?.workspace}
                aria-label={t('toolbar.workspace', '工作空间')}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('toolbar.workspace', '工作空间')}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {/* Global desensitize view toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 rounded-lg transition-all duration-200',
                'hover:bg-foreground/6 dark:hover:bg-white/8',
                globalShowOriginal && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
              onClick={toggleGlobal}
              aria-label="切换脱敏显示模式"
            >
              {globalShowOriginal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{globalShowOriginal ? '显示脱敏文本' : '显示原文'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg transition-all duration-200 hover:bg-foreground/6 dark:hover:bg-white/8"
              onClick={() => refresh()}
              disabled={loading}
              aria-label={t('toolbar.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('toolbar.refresh')}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
