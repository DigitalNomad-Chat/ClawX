/**
 * Advanced Config Page
 * Manage Tools, Session, Agents, Hooks, Skills, Messages, Commands configuration.
 * Ported from OpenClawSwitch ToolsSessionPage.vue.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Save,
  AlertCircle,
  Settings2,
  Network,
  Globe,
  Shield,
  MessageSquare,
  Wrench,
  Trash2,
  Users,
  GitBranch,
  SlidersHorizontal,
  Info,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { hostApiFetch } from '@/lib/host-api';
import { useOpenClawConfig } from '@/hooks/useOpenClawConfig';
import { useTagList } from '@/hooks/useTagList';
import type {
  OpenClawConfig,
  ToolsConfig,
  SessionConfig,
  HooksConfig,
  AgentItem,
  AgentDefaults,
} from './types';

/** Agent summary from backend API */
interface AgentSummary {
  id: string;
  name: string;
  isDefault: boolean;
  modelDisplay: string;
  modelRef: string | null;
  workspace: string;
  channelTypes: string[];
}

// ============================================================================
// Constants
// ============================================================================

const PROFILE_OPTIONS = [
  { value: 'full', label: 'full — 全部工具可用' },
  { value: 'minimal', label: 'minimal — 仅基础工具' },
];

const SEARCH_PROVIDER_OPTIONS = [
  { value: 'brave', label: 'Brave' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'grok', label: 'Grok' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'kimi', label: 'Kimi' },
];

const SESSIONS_VISIBILITY_OPTIONS = [
  { value: '', label: '未设置（使用默认）' },
  { value: 'default', label: 'default — 默认可见性' },
  { value: 'all', label: 'all — 所有会话可见' },
  { value: 'owner', label: 'owner — 仅所有者可见' },
  { value: 'private', label: 'private — 完全私有' },
];

const DM_SCOPE_OPTIONS = [
  { value: 'per-channel-peer', label: 'per-channel-peer — 每个渠道对等方独立' },
  { value: 'per-agent', label: 'per-agent — 每个 Agent 独立' },
  { value: 'global', label: 'global — 全局共享' },
];

const MAINTENANCE_MODE_OPTIONS = [
  { value: 'enforce', label: 'enforce — 强制执行过期清理' },
  { value: 'off', label: 'off — 关闭自动清理' },
];

const THINKING_DEFAULT_OPTIONS = [
  { value: 'off', label: 'off — 关闭思考模式' },
  { value: 'minimal', label: 'minimal — 最小思考' },
  { value: 'low', label: 'low — 低强度' },
  { value: 'medium', label: 'medium — 中等强度（默认）' },
  { value: 'high', label: 'high — 高强度' },
  { value: 'xhigh', label: 'xhigh — 极高强度' },
  { value: 'adaptive', label: 'adaptive — 自适应强度' },
];

const CONTEXT_PRUNING_MODE_OPTIONS = [
  { value: '', label: '未设置（默认）' },
  { value: 'cache-ttl', label: 'cache-ttl — 基于缓存 TTL 修剪' },
  { value: 'fixed-size', label: 'fixed-size — 固定大小修剪' },
  { value: 'adaptive', label: 'adaptive — 自适应修剪' },
];

const ACK_REACTION_SCOPE_OPTIONS = [
  { value: '', label: '未设置（默认）' },
  { value: 'group-mentions', label: 'group-mentions — 仅群组 @ 时回应' },
  { value: 'all', label: 'all — 所有消息都回应' },
  { value: 'none', label: 'none — 不回应' },
];

const COMMANDS_NATIVE_OPTIONS = [
  { value: 'auto', label: 'auto — 自动检测' },
  { value: 'on', label: 'on — 强制启用' },
  { value: 'off', label: 'off — 强制禁用' },
];

const COMMANDS_OWNER_DISPLAY_OPTIONS = [
  { value: 'raw', label: 'raw — 原始输出' },
  { value: 'redacted', label: 'redacted — 脱敏输出' },
];

const OPENCLAW_TOOL_NAMES = [
  { id: 'exec', label: 'exec', desc: '执行命令' },
  { id: 'process', label: 'process', desc: '进程管理' },
  { id: 'code_execution', label: 'code_execution', desc: '沙箱代码执行' },
  { id: 'browser', label: 'browser', desc: '浏览器控制' },
  { id: 'canvas', label: 'canvas', desc: '可视化工作区' },
  { id: 'web_search', label: 'web_search', desc: 'Web 搜索' },
  { id: 'x_search', label: 'x_search', desc: 'X 搜索' },
  { id: 'web_fetch', label: 'web_fetch', desc: '网页抓取' },
  { id: 'read', label: 'read', desc: '读取文件' },
  { id: 'write', label: 'write', desc: '写入文件' },
  { id: 'edit', label: 'edit', desc: '编辑文件' },
  { id: 'apply_patch', label: 'apply_patch', desc: '应用补丁' },
  { id: 'message', label: 'message', desc: '发送消息' },
  { id: 'nodes', label: 'nodes', desc: '设备发现' },
  { id: 'cron', label: 'cron', desc: '定时任务' },
  { id: 'gateway', label: 'gateway', desc: '网关管理' },
  { id: 'image', label: 'image', desc: '图像分析' },
];

const OPENCLAW_TOOL_GROUPS = [
  { id: 'group:runtime', label: 'group:runtime', desc: '命令执行' },
  { id: 'group:fs', label: 'group:fs', desc: '文件读写' },
  { id: 'group:sessions', label: 'group:sessions', desc: '会话管理' },
  { id: 'group:memory', label: 'group:memory', desc: '记忆检索' },
  { id: 'group:web', label: 'group:web', desc: 'Web 工具' },
  { id: 'group:ui', label: 'group:ui', desc: '界面控制' },
  { id: 'group:automation', label: 'group:automation', desc: '自动化' },
  { id: 'group:messaging', label: 'group:messaging', desc: '消息通道' },
  { id: 'group:nodes', label: 'group:nodes', desc: '节点管理' },
  { id: 'group:openclaw', label: 'group:openclaw', desc: '全部内置工具' },
];

const ALL_TOOL_OPTIONS = [...OPENCLAW_TOOL_NAMES, ...OPENCLAW_TOOL_GROUPS];

const DEFAULT_HOOK_ENTRIES = [
  { id: 'boot-md', label: 'Boot Markdown', description: '启动时加载 Markdown 引导文件' },
  { id: 'bootstrap-extra-files', label: 'Bootstrap Extra Files', description: '启动时加载额外配置文件' },
  { id: 'command-logger', label: 'Command Logger', description: '记录所有命令执行日志' },
  { id: 'session-memory', label: 'Session Memory', description: '跨会话记忆持久化存储' },
];

// ============================================================================
// Helper Components
// ============================================================================

function HelpTooltip({ title, content }: { title: string; content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium text-xs mb-1">{title}</p>
        <p className="text-xs text-muted-foreground">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ConfigCard({
  children,
  className = '',
  accent = false,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border transition-colors ${accent ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-muted/20 hover:bg-muted/30'} ${className}`}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  helpTitle,
  helpContent,
  accent,
}: {
  children: React.ReactNode;
  helpTitle?: string;
  helpContent?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className={`text-xs font-semibold ${accent ? 'text-primary' : 'text-foreground/80'}`}>
        {children}
      </span>
      {helpTitle && helpContent && <HelpTooltip title={helpTitle} content={helpContent} />}
    </div>
  );
}

function TagInput({
  tags,
  onRemove,
  inputValue,
  onInputChange,
  onPush,
  onKeydown,
  placeholder,
  quickOptions,
  onQuickAdd,
  variant = 'default',
}: {
  tags: string[];
  onRemove: (item: string) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onPush: () => void;
  onKeydown: (e: React.KeyboardEvent) => void;
  placeholder: string;
  quickOptions?: { id: string; label: string; desc: string }[];
  onQuickAdd?: (id: string) => void;
  variant?: 'default' | 'success' | 'destructive' | 'accent';
}) {
  const badgeVariant =
    variant === 'success' ? 'secondary' :
    variant === 'destructive' ? 'destructive' :
    variant === 'accent' ? 'default' :
    'secondary';

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mt-1 min-h-[28px]">
        {tags.map((item) => (
          <Badge
            key={item}
            variant={badgeVariant}
            className="cursor-pointer group"
            onClick={() => onRemove(item)}
          >
            {item}
            <Trash2 className="w-3 h-3 opacity-60 group-hover:opacity-100 ml-1" />
          </Badge>
        ))}
        {tags.length === 0 && (
          <span className="text-xs italic text-muted-foreground">无</span>
        )}
      </div>
      <div className="flex gap-1 mt-1">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeydown}
          placeholder={placeholder}
          className="h-7 text-xs flex-1"
        />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onPush}>
          +
        </Button>
      </div>
      {quickOptions && onQuickAdd && (
        <div className="mt-2 flex flex-wrap gap-1">
          {quickOptions
            .filter((t) => !tags.includes(t.id))
            .map((tool) => (
              <Badge
                key={tool.id}
                variant="outline"
                className="cursor-pointer"
                onClick={() => onQuickAdd(tool.id)}
                title={tool.desc}
              >
                + {tool.label}
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AdvancedConfig() {
  const { loading, saving, error, configSource, loadConfig, saveConfig } = useOpenClawConfig();

  // Form state
  const [isDirty, setIsDirty] = useState(false);

  // Tools
  const [toolsProfile, setToolsProfile] = useState('full');
  const toolsAllow = useTagList([]);
  const toolsDeny = useTagList([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchProvider, setWebSearchProvider] = useState('brave');
  const [webSearchApiKey, setWebSearchApiKey] = useState('');
  const [webFetchEnabled, setWebFetchEnabled] = useState(true);
  const [sessionsVisibility, setSessionsVisibility] = useState('');
  const [a2aEnabled, setA2aEnabled] = useState(true);
  const a2aAllow = useTagList([]);
  const sandboxAllow = useTagList([]);
  const sandboxDeny = useTagList([]);

  // Session
  const [dmScope, setDmScope] = useState('per-channel-peer');
  const [maxPingPong, setMaxPingPong] = useState(5);
  const [maintenanceMode, setMaintenanceMode] = useState('enforce');
  const [pruneAfter, setPruneAfter] = useState('7d');
  const [sessionIdleMinutes, setSessionIdleMinutes] = useState(0);

  // Agents
  const [agentList, setAgentList] = useState<AgentItem[]>([]);
  const [agentsInfo, setAgentsInfo] = useState<AgentSummary[]>([]);

  // Hooks
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [hookEntries, setHookEntries] = useState(
    DEFAULT_HOOK_ENTRIES.map((h) => ({ ...h, enabled: true })),
  );

  // Skills
  const skillsExtraDirs = useTagList([]);

  // Messages
  const [ackReactionScope, setAckReactionScope] = useState('');

  // Commands
  const [commandsNative, setCommandsNative] = useState('auto');
  const [commandsRestart, setCommandsRestart] = useState(true);
  const [commandsOwnerDisplay, setCommandsOwnerDisplay] = useState('raw');

  // Agent Defaults
  const [thinkingDefault, setThinkingDefault] = useState('medium');
  const [timeoutSeconds, setTimeoutSeconds] = useState(600);
  const [heartbeatEvery, setHeartbeatEvery] = useState('30m');
  const [contextPruningMode, setContextPruningMode] = useState('cache-ttl');
  const [contextPruningTtl, setContextPruningTtl] = useState('1h');
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [subagentsMaxConcurrent, setSubagentsMaxConcurrent] = useState(8);

  // Wizard (read-only)
  const [wizardInfo, setWizardInfo] = useState<{
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommand?: string;
    lastRunMode?: string;
  }>({});

  // Agent name map — built from both agentList (config file) and agentsInfo (API)
  // so that display names are available for all known Agents
  const agentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agentList) {
      map.set(a.id, a.name || a.id);
    }
    for (const a of agentsInfo) {
      if (!map.has(a.id)) map.set(a.id, a.name || a.id);
    }
    return map;
  }, [agentList, agentsInfo]);

  function agentDisplayName(id: string): string {
    const name = agentNameMap.get(id) || id;
    return name !== id ? `${name} (${id})` : id;
  }

  // ========================================================================
  // Sync config → form
  // ========================================================================

  function syncFormFromConfig() {
    if (!configSource) return;
    const { config } = configSource;
    const t = config.tools ?? ({} as ToolsConfig);
    const s = config.session ?? ({} as SessionConfig);

    setToolsProfile(t.profile ?? 'full');
    toolsAllow.setTags([...(t.allow ?? [])]);
    toolsDeny.setTags([...(t.deny ?? [])]);
    setWebSearchEnabled(t.web?.search?.enabled ?? false);
    setWebSearchProvider(t.web?.search?.provider ?? 'brave');
    setWebSearchApiKey(t.web?.search?.apiKey ?? '');
    setWebFetchEnabled(t.web?.fetch?.enabled ?? true);
    setSessionsVisibility(t.sessions?.visibility ?? '');
    setA2aEnabled(t.agentToAgent?.enabled ?? true);
    a2aAllow.setTags([...(t.agentToAgent?.allow ?? [])]);
    sandboxAllow.setTags([...(t.sandbox?.tools?.allow ?? [])]);
    sandboxDeny.setTags([...(t.sandbox?.tools?.deny ?? [])]);

    setDmScope(s.dmScope ?? 'per-channel-peer');
    setMaxPingPong(s.agentToAgent?.maxPingPongTurns ?? 5);
    setMaintenanceMode(s.maintenance?.mode ?? 'enforce');
    setPruneAfter(s.maintenance?.pruneAfter ?? '7d');
    setSessionIdleMinutes(s.idleMinutes ?? 0);

    // Agents list - preserve all original fields to avoid data loss
    const list = config.agents?.list;
    if (Array.isArray(list)) {
      setAgentList(
        list.map((item) => ({
          ...item,
          id: item.id || '',
          name: item.name || item.id || '',
          workspace: item.workspace,
          model: typeof item.model === 'string' ? item.model : undefined,
          skills: Array.isArray(item.skills) ? [...item.skills] : [],
        })),
      );
    } else {
      setAgentList([]);
    }

    // Hooks
    const h = config.hooks ?? ({} as HooksConfig);
    setHooksEnabled(h.internal?.enabled ?? true);
    const entries = h.internal?.entries ?? {};
    setHookEntries(
      DEFAULT_HOOK_ENTRIES.map((def) => ({
        ...def,
        enabled: entries[def.id]?.enabled ?? true,
      })),
    );

    // Skills
    skillsExtraDirs.setTags([...(config.skills?.load?.extraDirs ?? [])]);

    // Messages
    setAckReactionScope(config.messages?.ackReactionScope ?? '');

    // Commands
    setCommandsNative(
      typeof config.commands?.native === 'string' ? config.commands.native : 'auto',
    );
    setCommandsRestart(config.commands?.restart ?? true);
    setCommandsOwnerDisplay(
      typeof config.commands?.ownerDisplay === 'string'
        ? config.commands.ownerDisplay
        : 'raw',
    );

    // Agent Defaults
    const defaults = config.agents?.defaults ?? ({} as AgentDefaults);
    setThinkingDefault(defaults.thinkingDefault ?? 'medium');
    setTimeoutSeconds(defaults.timeoutSeconds ?? 600);
    setHeartbeatEvery(defaults.heartbeat?.every ?? '30m');
    setContextPruningMode(defaults.contextPruning?.mode ?? 'cache-ttl');
    setContextPruningTtl(defaults.contextPruning?.ttl ?? '1h');
    setMaxConcurrent(defaults.maxConcurrent ?? 4);
    setSubagentsMaxConcurrent(defaults.subagents?.maxConcurrent ?? 8);

    // Wizard
    setWizardInfo({
      lastRunAt: config.wizard?.lastRunAt,
      lastRunVersion: config.wizard?.lastRunVersion,
      lastRunCommand: config.wizard?.lastRunCommand,
      lastRunMode: config.wizard?.lastRunMode,
    });

    setIsDirty(false);
  }

  // ========================================================================
  // Build config from form
  // ========================================================================

  function buildHooksConfig(): HooksConfig {
    const entries: Record<string, { enabled?: boolean }> = {};
    for (const hook of hookEntries) {
      entries[hook.id] = { enabled: hook.enabled };
    }
    return { internal: { enabled: hooksEnabled, entries } };
  }

  // ========================================================================
  // Handlers
  // ========================================================================

  async function handleRefresh() {
    await loadConfig();
    loadAgents();
    toast.success('已刷新');
  }

  async function handleSave() {
    try {
      if (!configSource) throw new Error('未加载配置');
      const orig = configSource.config;

      const updated: OpenClawConfig = {
        ...orig,

        // tools: 合并原始，只覆盖表单字段
        tools: {
          ...(orig.tools ?? {}),
          profile: toolsProfile,
          ...(toolsAllow.tags.length > 0 ? { allow: [...toolsAllow.tags] } : {}),
          ...(toolsDeny.tags.length > 0 ? { deny: [...toolsDeny.tags] } : {}),
          web: {
            ...(orig.tools?.web ?? {}),
            search: {
              ...(orig.tools?.web?.search ?? {}),
              enabled: webSearchEnabled,
              provider: webSearchProvider,
              ...(webSearchApiKey ? { apiKey: webSearchApiKey } : {}),
            },
            fetch: { enabled: webFetchEnabled },
          },
          ...(sessionsVisibility ? { sessions: { visibility: sessionsVisibility } } : {}),
          agentToAgent: {
            ...(orig.tools?.agentToAgent ?? {}),
            enabled: a2aEnabled,
            ...(a2aAllow.tags.length > 0 ? { allow: [...a2aAllow.tags] } : {}),
          },
          ...((sandboxAllow.tags.length > 0 || sandboxDeny.tags.length > 0)
            ? {
                sandbox: {
                  ...(orig.tools?.sandbox ?? {}),
                  tools: {
                    ...(sandboxAllow.tags.length > 0 ? { allow: [...sandboxAllow.tags] } : {}),
                    ...(sandboxDeny.tags.length > 0 ? { deny: [...sandboxDeny.tags] } : {}),
                  },
                },
              }
            : {}),
        },

        // session: 合并原始，覆盖表单字段
        session: {
          ...(orig.session ?? {}),
          dmScope,
          ...(sessionIdleMinutes > 0 ? { idleMinutes: sessionIdleMinutes } : {}),
          agentToAgent: {
            ...(orig.session?.agentToAgent ?? {}),
            maxPingPongTurns: maxPingPong,
          },
          maintenance: {
            ...(orig.session?.maintenance ?? {}),
            mode: maintenanceMode,
            pruneAfter,
          },
        },

        // agents: 合并原始，只覆盖 list 和 defaults 的表单字段
        agents: {
          ...(orig.agents ?? {}),
          list: agentList,
          defaults: {
            ...(orig.agents?.defaults ?? {}),
            thinkingDefault: thinkingDefault as AgentDefaults['thinkingDefault'],
            timeoutSeconds,
            ...(heartbeatEvery !== '30m' ? { heartbeat: { every: heartbeatEvery } } : {}),
            contextPruning: {
              ...(typeof orig.agents?.defaults?.contextPruning === 'object'
                ? orig.agents.defaults.contextPruning
                : {}),
              ...(contextPruningMode ? { mode: contextPruningMode } : {}),
              ...(contextPruningTtl ? { ttl: contextPruningTtl } : {}),
            },
            maxConcurrent,
            subagents: { maxConcurrent: subagentsMaxConcurrent },
          },
        },

        // hooks: 由固定列表管理，直接重建
        hooks: buildHooksConfig(),

        // skills: 合并原始，只覆盖 load.extraDirs
        skills: {
          ...(orig.skills ?? {}),
          load: {
            ...(orig.skills?.load ?? {}),
            extraDirs: [...skillsExtraDirs.tags],
          },
        },

        // messages: 合并原始，覆盖 ackReactionScope
        messages: {
          ...(orig.messages ?? {}),
          ...(ackReactionScope ? { ackReactionScope } : {}),
        },

        // commands: 合并原始，覆盖表单字段
        commands: {
          ...(orig.commands ?? {}),
          native: commandsNative,
          restart: commandsRestart,
          ownerDisplay: commandsOwnerDisplay,
        },
      };

      await saveConfig(updated);
      setIsDirty(false);
      toast.success('配置已保存');
    } catch (err) {
      console.error('保存失败:', err);
      toast.error(`保存失败: ${err}`);
    }
  }

  async function loadAgents() {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        agents: AgentSummary[];
      }>('/api/agents');
      if (result.success) {
        setAgentsInfo(result.agents);
      }
    } catch {
      // ignore
    }
  }

  function markDirty() {
    setIsDirty(true);
  }

  // Agent skills management
  function addAgentSkill(agentId: string, skill: string) {
    setAgentList((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, skills: [...(a.skills ?? []), skill] }
          : a,
      ),
    );
    setIsDirty(true);
  }

  function removeAgentSkill(agentId: string, skill: string) {
    setAgentList((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, skills: (a.skills ?? []).filter((s) => s !== skill) }
          : a,
      ),
    );
    setIsDirty(true);
  }

  // Toggle hook entry
  function toggleHookEntry(id: string, enabled: boolean) {
    setHookEntries((prev) =>
      prev.map((h) => (h.id === id ? { ...h, enabled } : h)),
    );
    setIsDirty(true);
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  useEffect(() => {
    loadConfig().then(() => {
      // syncFormFromConfig will be called by the effect below
    });
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncFormFromConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSource?.config]);

  // ========================================================================
  // Config path display
  // ========================================================================

  const configPath = configSource?.fileInfo.path ?? '';

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">高级配置</h1>
              <p className="text-sm text-muted-foreground">
                管理 Tools、Session 等 Agent 间通信与会话配置
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-amber-500 font-medium px-2 py-1 rounded-full bg-amber-500/10">
                未保存
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        {/* Loading */}
        {loading && !configSource && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-3 text-muted-foreground text-sm">加载配置中...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !configSource && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h4 className="text-base font-medium">加载失败</h4>
              <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-4">
                <RefreshCw className="h-4 w-4" />
                重试
              </Button>
            </div>
          </div>
        )}

        {/* Config sections */}
        {configSource && (
          <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-6">
            {/* ================================================ */}
            {/* Tools Config */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <Wrench className="h-4 w-4 text-primary" />
                Tools 配置
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Profile */}
                <ConfigCard>
                  <FieldLabel helpTitle="工具 Profile" helpContent="控制 Agent 可使用的工具集级别。full = 所有工具可用，minimal = 仅基础安全工具。">
                    工具 Profile
                  </FieldLabel>
                  <Select
                    value={toolsProfile}
                    onChange={(e) => { setToolsProfile(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {PROFILE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* Web Search */}
                <ConfigCard>
                  <FieldLabel helpTitle="Web 搜索" helpContent="开启后 Agent 可以调用搜索引擎获取实时信息。支持 Brave、Perplexity、Grok、Gemini、Kimi 等提供商。">
                    Web 搜索
                  </FieldLabel>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={webSearchEnabled}
                        onCheckedChange={(v) => { setWebSearchEnabled(v); markDirty(); }}
                      />
                      <span className="text-sm">启用搜索</span>
                    </label>
                    <Select
                      value={webSearchProvider}
                      onChange={(e) => { setWebSearchProvider(e.target.value); markDirty(); }}
                      disabled={!webSearchEnabled}
                      className="h-8 text-xs"
                    >
                      {SEARCH_PROVIDER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    <Input
                      value={webSearchApiKey}
                      onChange={(e) => { setWebSearchApiKey(e.target.value); markDirty(); }}
                      placeholder="API Key（可选）"
                      className="h-8 text-xs"
                      disabled={!webSearchEnabled}
                    />
                  </div>
                </ConfigCard>

                {/* Web Fetch */}
                <ConfigCard>
                  <FieldLabel helpTitle="Web Fetch" helpContent="开启后 Agent 可以抓取任意 URL 的页面内容，获取实时网页信息。">
                    Web Fetch
                  </FieldLabel>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={webFetchEnabled}
                      onCheckedChange={(v) => { setWebFetchEnabled(v); markDirty(); }}
                    />
                    <span className="text-sm">启用页面抓取</span>
                  </label>
                </ConfigCard>

                {/* Sessions Visibility */}
                <ConfigCard>
                  <FieldLabel helpTitle="Sessions 可见性" helpContent="控制 Agent 会话历史对其他 Agent 的可见程度。">
                    Sessions 可见性
                  </FieldLabel>
                  <Select
                    value={sessionsVisibility}
                    onChange={(e) => { setSessionsVisibility(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {SESSIONS_VISIBILITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* Tool Access Control */}
                <ConfigCard className="col-span-2">
                  <FieldLabel helpTitle="工具访问控制" helpContent="全局黑/白名单控制哪些工具可用。支持工具组写法如 group:fs、group:web。">
                    工具访问控制
                  </FieldLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Allow</span>
                      <TagInput
                        tags={toolsAllow.tags}
                        onRemove={(item) => { toolsAllow.pop(item); markDirty(); }}
                        inputValue={toolsAllow.input}
                        onInputChange={toolsAllow.setInput}
                        onPush={toolsAllow.push}
                        onKeydown={toolsAllow.onKeydown}
                        placeholder="输入工具名或组名..."
                        quickOptions={ALL_TOOL_OPTIONS}
                        onQuickAdd={(id) => { toolsAllow.setTags([...toolsAllow.tags, id]); markDirty(); }}
                        variant="success"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Deny</span>
                      <TagInput
                        tags={toolsDeny.tags}
                        onRemove={(item) => { toolsDeny.pop(item); markDirty(); }}
                        inputValue={toolsDeny.input}
                        onInputChange={toolsDeny.setInput}
                        onPush={toolsDeny.push}
                        onKeydown={toolsDeny.onKeydown}
                        placeholder="输入工具名或组名..."
                        quickOptions={ALL_TOOL_OPTIONS}
                        onQuickAdd={(id) => { toolsDeny.setTags([...toolsDeny.tags, id]); markDirty(); }}
                        variant="destructive"
                      />
                    </div>
                  </div>
                </ConfigCard>

                {/* A2A Communication */}
                <ConfigCard accent className="col-span-2">
                  <FieldLabel accent helpTitle="A2A 通信" helpContent="开启后 Agent 之间可以互相委派任务、共享上下文、协同工作。白名单可限制允许参与 A2A 的 Agent 列表。">
                    <Network className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    Agent-to-Agent 通信
                  </FieldLabel>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={a2aEnabled}
                        onCheckedChange={(v) => { setA2aEnabled(v); markDirty(); }}
                      />
                      <span className="text-sm font-medium">启用 Agent 间通信</span>
                    </label>
                    {a2aEnabled && (
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Agent 白名单（留空表示允许所有）
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1 min-h-[28px]">
                          {a2aAllow.tags.map((item) => (
                            <Badge
                              key={item}
                              className="cursor-pointer group"
                              onClick={() => { a2aAllow.pop(item); markDirty(); }}
                            >
                              {agentDisplayName(item)}
                              <Trash2 className="w-3 h-3 opacity-60 group-hover:opacity-100 ml-1" />
                            </Badge>
                          ))}
                          {a2aAllow.tags.length === 0 && (
                            <span className="text-xs italic text-muted-foreground">
                              未设置白名单，允许所有 Agent 通信
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-1">
                          <Input
                            value={a2aAllow.input}
                            onChange={(e) => a2aAllow.setInput(e.target.value)}
                            onKeyDown={a2aAllow.onKeydown}
                            placeholder="输入 Agent ID 或名称..."
                            className="h-7 text-xs flex-1"
                          />
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={a2aAllow.push}>
                            +
                          </Button>
                        </div>
                        {(() => {
                          // Merge agents from config (agentList) and API (agentsInfo)
                          // to provide the most complete list for quick-add
                          const allAgents = new Map<string, { id: string; name: string }>();
                          for (const a of agentList) {
                            allAgents.set(a.id, { id: a.id, name: a.name || a.id });
                          }
                          for (const a of agentsInfo) {
                            if (!allAgents.has(a.id)) {
                              allAgents.set(a.id, { id: a.id, name: a.name || a.id });
                            }
                          }
                          const available = [...allAgents.values()]
                            .filter((a) => !a2aAllow.tags.includes(a.id));
                          return available.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {available.map((agent) => (
                                <Badge
                                  key={agent.id}
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={() => {
                                    a2aAllow.setTags([...a2aAllow.tags, agent.id]);
                                    markDirty();
                                  }}
                                >
                                  + {agent.name}
                                </Badge>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </ConfigCard>

                {/* Sandbox */}
                <ConfigCard className="col-span-2">
                  <FieldLabel helpTitle="Sandbox 工具控制" helpContent="沙箱环境中的工具权限控制。">
                    <Shield className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    Sandbox 工具控制
                  </FieldLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Allow</span>
                      <TagInput
                        tags={sandboxAllow.tags}
                        onRemove={(item) => { sandboxAllow.pop(item); markDirty(); }}
                        inputValue={sandboxAllow.input}
                        onInputChange={sandboxAllow.setInput}
                        onPush={sandboxAllow.push}
                        onKeydown={sandboxAllow.onKeydown}
                        placeholder="添加 allow..."
                        quickOptions={ALL_TOOL_OPTIONS}
                        onQuickAdd={(id) => { sandboxAllow.setTags([...sandboxAllow.tags, id]); markDirty(); }}
                        variant="success"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Deny</span>
                      <TagInput
                        tags={sandboxDeny.tags}
                        onRemove={(item) => { sandboxDeny.pop(item); markDirty(); }}
                        inputValue={sandboxDeny.input}
                        onInputChange={sandboxDeny.setInput}
                        onPush={sandboxDeny.push}
                        onKeydown={sandboxDeny.onKeydown}
                        placeholder="添加 deny..."
                        quickOptions={ALL_TOOL_OPTIONS}
                        onQuickAdd={(id) => { sandboxDeny.setTags([...sandboxDeny.tags, id]); markDirty(); }}
                        variant="destructive"
                      />
                    </div>
                  </div>
                </ConfigCard>
              </div>
            </section>

            {/* ================================================ */}
            {/* Session Config */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <MessageSquare className="h-4 w-4 text-primary" />
                Session 配置
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DM Scope */}
                <ConfigCard>
                  <FieldLabel helpTitle="DM 作用域" helpContent="控制私聊会话在不同 Agent 之间的共享方式。">
                    DM 作用域
                  </FieldLabel>
                  <Select
                    value={dmScope}
                    onChange={(e) => { setDmScope(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {DM_SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* A2A PingPong */}
                <ConfigCard accent>
                  <FieldLabel accent helpTitle="A2A 乒乓轮次" helpContent="Agent 间互相通信时的最大来回次数上限，防止无限循环对话。默认 5 轮后强制终止。">
                    <Network className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    A2A 乒乓轮次
                  </FieldLabel>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={maxPingPong}
                      onChange={(e) => { setMaxPingPong(Number(e.target.value)); markDirty(); }}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-lg font-mono font-bold min-w-[2rem] text-right">
                      {maxPingPong}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Agent 间对话最大轮次（1-5），超出后终止通信。默认 5
                  </p>
                </ConfigCard>

                {/* Session Maintenance */}
                <ConfigCard className="col-span-2">
                  <FieldLabel helpTitle="会话维护" helpContent="自动清理过期的会话历史。">
                    <Globe className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    会话维护
                  </FieldLabel>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <Label className="text-xs mb-1 block text-muted-foreground">维护模式</Label>
                      <Select
                        value={maintenanceMode}
                        onChange={(e) => { setMaintenanceMode(e.target.value); markDirty(); }}
                        className="h-8 text-xs"
                      >
                        {MAINTENANCE_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs mb-1 block text-muted-foreground">过期时间</Label>
                      <Input
                        value={pruneAfter}
                        onChange={(e) => { setPruneAfter(e.target.value); markDirty(); }}
                        placeholder="如 7d, 30d"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-1">
                        <Label className="text-xs text-muted-foreground">空闲超时（分钟）</Label>
                        <HelpTooltip title="空闲超时" content="会话在没有任何活动后判定为空闲的时间。留空或 0 表示不限制。" />
                      </div>
                      <Input
                        type="number"
                        value={sessionIdleMinutes || ''}
                        onChange={(e) => { setSessionIdleMinutes(Number(e.target.value) || 0); markDirty(); }}
                        placeholder="10080 = 7天，留空=不限制"
                        className="h-8 text-xs"
                        min={1}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground pb-2">
                      {sessionIdleMinutes > 0 ? (
                        <>
                          ≈ {Math.round(sessionIdleMinutes / 1440)} 天
                          ({Math.round(sessionIdleMinutes / 60)} 小时)
                        </>
                      ) : (
                        '未设置（使用框架默认）'
                      )}
                    </div>
                  </div>
                </ConfigCard>
              </div>
            </section>

            {/* ================================================ */}
            {/* Agent List */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Agent 列表
              </h3>

              {agentList.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">未检测到 Agent 配置</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    请在 openclaw.json 的 agents.list 中添加 Agent
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agentList.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onAddSkill={(skill) => addAgentSkill(agent.id, skill)}
                      onRemoveSkill={(skill) => removeAgentSkill(agent.id, skill)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ================================================ */}
            {/* Agent Defaults */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Agent 默认配置
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigCard>
                  <FieldLabel helpTitle="Thinking Default" helpContent="控制 Agent 默认的思考强度。">
                    思考模式
                  </FieldLabel>
                  <Select
                    value={thinkingDefault}
                    onChange={(e) => { setThinkingDefault(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {THINKING_DEFAULT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="请求超时" helpContent="单次 LLM 请求的最大等待时间（秒）。默认 600。">
                    请求超时（秒）
                  </FieldLabel>
                  <Input
                    type="number"
                    value={timeoutSeconds || ''}
                    onChange={(e) => { setTimeoutSeconds(Number(e.target.value) || 600); markDirty(); }}
                    placeholder="600"
                    className="h-8 text-xs"
                    min={1}
                  />
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="心跳间隔" helpContent="Agent 向网关发送心跳的间隔。如 30m、1h。">
                    心跳间隔
                  </FieldLabel>
                  <Input
                    value={heartbeatEvery}
                    onChange={(e) => { setHeartbeatEvery(e.target.value); markDirty(); }}
                    placeholder="30m"
                    className="h-8 text-xs"
                  />
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="上下文修剪模式" helpContent="当对话上下文过长时的修剪策略。">
                    上下文修剪模式
                  </FieldLabel>
                  <Select
                    value={contextPruningMode}
                    onChange={(e) => { setContextPruningMode(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {CONTEXT_PRUNING_MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="修剪 TTL" helpContent="上下文修剪有效期。如 1h、30m。">
                    修剪 TTL
                  </FieldLabel>
                  <Input
                    value={contextPruningTtl}
                    onChange={(e) => { setContextPruningTtl(e.target.value); markDirty(); }}
                    placeholder="1h"
                    className="h-8 text-xs"
                  />
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="最大并发数" helpContent="Agent 同时执行的最大任务数。默认 4。">
                    最大并发数
                  </FieldLabel>
                  <Input
                    type="number"
                    value={maxConcurrent || ''}
                    onChange={(e) => { setMaxConcurrent(Number(e.target.value) || 4); markDirty(); }}
                    placeholder="4"
                    className="h-8 text-xs"
                    min={1}
                  />
                </ConfigCard>

                <ConfigCard>
                  <FieldLabel helpTitle="子 Agent 最大并发数" helpContent="子 Agent 同时执行的最大任务数。默认 8。">
                    子 Agent 最大并发数
                  </FieldLabel>
                  <Input
                    type="number"
                    value={subagentsMaxConcurrent || ''}
                    onChange={(e) => { setSubagentsMaxConcurrent(Number(e.target.value) || 8); markDirty(); }}
                    placeholder="8"
                    className="h-8 text-xs"
                    min={1}
                  />
                </ConfigCard>
              </div>
            </section>

            {/* ================================================ */}
            {/* Hooks */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <GitBranch className="h-4 w-4 text-primary" />
                Hooks 钩子管理
              </h3>

              {/* Master toggle */}
              <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <FieldLabel accent helpTitle="内部钩子" helpContent="全局控制所有内部钩子是否生效。">
                  内部钩子总开关
                </FieldLabel>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <Switch
                    checked={hooksEnabled}
                    onCheckedChange={(v) => { setHooksEnabled(v); markDirty(); }}
                  />
                  <span className="text-sm">{hooksEnabled ? '已启用' : '已禁用'}</span>
                </label>
              </div>

              {/* Hook entries */}
              <div
                className={`grid grid-cols-2 gap-3 ${!hooksEnabled ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {hookEntries.map((hook) => (
                  <ConfigCard key={hook.id}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-foreground/70">{hook.label}</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Switch
                          checked={hook.enabled}
                          onCheckedChange={(v) => toggleHookEntry(hook.id, v)}
                          disabled={!hooksEnabled}
                        />
                        <span
                          className={`text-xs ${hook.enabled ? 'text-green-600' : 'text-muted-foreground'}`}
                        >
                          {hook.enabled ? 'ON' : 'OFF'}
                        </span>
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">{hook.description}</p>
                    <code className="block mt-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {hook.id}
                    </code>
                  </ConfigCard>
                ))}
              </div>
            </section>

            {/* ================================================ */}
            {/* Skills Config */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <Wrench className="h-4 w-4 text-primary" />
                Skills 配置
              </h3>

              <ConfigCard>
                <FieldLabel helpTitle="额外技能目录" helpContent="指定额外的技能加载目录列表。">
                  额外技能目录（extraDirs）
                </FieldLabel>
                <TagInput
                  tags={skillsExtraDirs.tags}
                  onRemove={(item) => { skillsExtraDirs.pop(item); markDirty(); }}
                  inputValue={skillsExtraDirs.input}
                  onInputChange={skillsExtraDirs.setInput}
                  onPush={skillsExtraDirs.push}
                  onKeydown={skillsExtraDirs.onKeydown}
                  placeholder="输入目录路径..."
                  variant="accent"
                />
              </ConfigCard>
            </section>

            {/* ================================================ */}
            {/* Misc Config */}
            {/* ================================================ */}
            <section className="rounded-lg border shadow-sm bg-card p-4">
              <h3 className="flex items-center gap-2 pb-3 mb-3 border-b text-sm font-bold text-foreground">
                <Settings2 className="h-4 w-4 text-primary" />
                杂项配置
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ack Reaction Scope */}
                <ConfigCard>
                  <FieldLabel helpTitle="确认回应范围" helpContent="控制 Agent 处理消息后是否发送确认回应。">
                    <MessageSquare className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    确认回应范围
                  </FieldLabel>
                  <Select
                    value={ackReactionScope}
                    onChange={(e) => { setAckReactionScope(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {ACK_REACTION_SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* Commands Native */}
                <ConfigCard>
                  <FieldLabel helpTitle="原生命令处理" helpContent="控制是否处理原生命令。">
                    原生命令处理
                  </FieldLabel>
                  <Select
                    value={commandsNative}
                    onChange={(e) => { setCommandsNative(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {COMMANDS_NATIVE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* Commands Restart */}
                <ConfigCard>
                  <FieldLabel helpTitle="重启命令" helpContent="是否允许通过命令触发 Agent 重启。">
                    允许重启命令
                  </FieldLabel>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={commandsRestart}
                      onCheckedChange={(v) => { setCommandsRestart(v); markDirty(); }}
                    />
                    <span className="text-sm">{commandsRestart ? '允许' : '禁止'}</span>
                  </label>
                </ConfigCard>

                {/* Commands Owner Display */}
                <ConfigCard>
                  <FieldLabel helpTitle="所有者显示模式" helpContent="控制所有者执行命令时的输出显示方式。">
                    所有者显示模式
                  </FieldLabel>
                  <Select
                    value={commandsOwnerDisplay}
                    onChange={(e) => { setCommandsOwnerDisplay(e.target.value); markDirty(); }}
                    className="h-8 text-xs"
                  >
                    {COMMANDS_OWNER_DISPLAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </ConfigCard>

                {/* Wizard info (read-only) */}
                <ConfigCard className="col-span-2">
                  <FieldLabel helpTitle="配置向导" helpContent="记录上次运行配置向导的信息。">
                    配置向导记录
                  </FieldLabel>
                  {wizardInfo.lastRunAt ? (
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <span className="text-xs block text-muted-foreground">上次运行</span>
                        <span className="text-xs font-mono">{wizardInfo.lastRunAt}</span>
                      </div>
                      <div>
                        <span className="text-xs block text-muted-foreground">版本</span>
                        <span className="text-xs font-mono">{wizardInfo.lastRunVersion || '-'}</span>
                      </div>
                      <div>
                        <span className="text-xs block text-muted-foreground">命令</span>
                        <span className="text-xs font-mono">{wizardInfo.lastRunCommand || '-'}</span>
                      </div>
                      <div>
                        <span className="text-xs block text-muted-foreground">模式</span>
                        <span className="text-xs font-mono">{wizardInfo.lastRunMode || '-'}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">尚未运行过配置向导</p>
                  )}
                </ConfigCard>
              </div>
            </section>

            {/* Config file path */}
            {configPath && (
              <div className="px-2 py-2">
                <p className="text-xs text-muted-foreground">配置文件: {configPath}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Agent Card Sub-component
// ============================================================================

function AgentCard({
  agent,
  onAddSkill,
  onRemoveSkill,
}: {
  agent: AgentItem;
  onAddSkill: (skill: string) => void;
  onRemoveSkill: (skill: string) => void;
}) {
  const [skillInput, setSkillInput] = useState('');

  function handlePush() {
    const val = skillInput.trim();
    if (val && !(agent.skills ?? []).includes(val)) {
      onAddSkill(val);
    }
    setSkillInput('');
  }

  return (
    <ConfigCard>
      {/* Agent header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{agent.name || agent.id}</span>
          {agent.name && agent.name !== agent.id && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {agent.id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {agent.workspace && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Folder className="w-3 h-3" /> {agent.workspace}
            </span>
          )}
          {agent.model && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {agent.model}
            </span>
          )}
        </div>
      </div>

      {/* Skills tags */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs text-muted-foreground">Skills</span>
        <HelpTooltip title="Agent Skills" content="为该 Agent 绑定的技能列表。留空表示不限制。" />
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {(agent.skills ?? []).map((skill) => (
          <Badge
            key={skill}
            className="cursor-pointer group"
            onClick={() => onRemoveSkill(skill)}
          >
            {skill}
            <Trash2 className="w-3 h-3 opacity-60 group-hover:opacity-100 ml-1" />
          </Badge>
        ))}
        {!(agent.skills ?? []).length && (
          <span className="text-xs italic text-muted-foreground">未绑定技能</span>
        )}
      </div>
      <div className="flex gap-1 mt-1.5">
        <Input
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handlePush();
            }
          }}
          placeholder="输入技能名称..."
          className="h-7 text-xs flex-1"
        />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handlePush}>
          +
        </Button>
      </div>
    </ConfigCard>
  );
}
