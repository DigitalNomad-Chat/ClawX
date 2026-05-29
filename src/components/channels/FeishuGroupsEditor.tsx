import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Users, MessageSquare, Shield, AtSign, HelpCircle, RefreshCw, Search, UserPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { hostApiFetch } from '@/lib/host-api';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface FeishuGroupConfig {
  enabled?: boolean;
  requireMention?: boolean;
  groupPolicy?: 'allowlist' | 'open' | 'disabled';
  allowFrom?: string[];
  systemPrompt?: string;
}

export interface FeishuGroupsEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface GroupEntry {
  id: string; // internal React key
  groupId: string; // actual config key
  config: FeishuGroupConfig;
}

interface FeishuUser {
  name: string;
  openId: string;
  lastMessagePreview?: string;
  lastSeenAt?: number;
  agentId?: string;
}

const labelClasses = 'text-xs font-bold uppercase tracking-widest text-foreground/70';
const inputBaseClasses = 'h-9 rounded-xl bg-surface-input border-black/10 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 shadow-sm transition-all text-foreground placeholder:text-foreground/30';
const cardClasses = 'rounded-2xl bg-surface-input/40 border border-black/5 dark:border-white/5 p-4 space-y-4';

function parseGroups(value: string): Record<string, FeishuGroupConfig> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, FeishuGroupConfig>;
    }
  } catch {
    // ignore parse error
  }
  return {};
}

function stringifyGroups(entries: GroupEntry[]): string {
  const obj: Record<string, FeishuGroupConfig> = {};
  for (const entry of entries) {
    const gid = entry.groupId.trim();
    if (!gid) continue;
    obj[gid] = entry.config;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return '';
  return JSON.stringify(obj);
}

function entriesFromValue(value: string): GroupEntry[] {
  const parsed = parseGroups(value);
  return Object.entries(parsed).map(([groupId, config]) => ({
    id: crypto.randomUUID(),
    groupId,
    config,
  }));
}

export function FeishuGroupsEditor({ value, onChange }: FeishuGroupsEditorProps) {
  const { t } = useTranslation('channels');
  const [entries, setEntries] = useState<GroupEntry[]>(() => entriesFromValue(value));
  const isFirstRender = useRef(true);

  // Global user list cache
  const [allUsers, setAllUsers] = useState<FeishuUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [scanDebug, setScanDebug] = useState<Record<string, unknown> | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; fileCount: number }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // Per-entry UI state
  const [showUserPicker, setShowUserPicker] = useState<Record<string, boolean>>({});
  const [userSearch, setUserSearch] = useState<Record<string, string>>({});

  // Sync external value → local entries
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const currentStringified = stringifyGroups(entries);
    if (currentStringified !== value) {
      setEntries(entriesFromValue(value));
    }
  }, [value]);

  // Sync local entries → onChange
  useEffect(() => {
    const nextValue = stringifyGroups(entries);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }, [entries]);

  const fetchAgents = async () => {
    if (agents.length > 0) return;
    try {
      const result = await hostApiFetch<{
        success: boolean;
        agents?: Array<{ id: string; name: string; fileCount: number }>;
        error?: string;
      }>('/api/channels/feishu/agents');
      if (result.success && result.agents) {
        setAgents(result.agents);
      }
    } catch {
      // ignore
    }
  };

  const fetchUsers = async () => {
    if (usersLoading) return;
    setUsersLoading(true);
    setUsersError(null);
    setScanDebug(null);
    try {
      const agentParam = selectedAgentId ? `&agentId=${encodeURIComponent(selectedAgentId)}` : '';
      const result = await hostApiFetch<{
        success: boolean;
        users?: FeishuUser[];
        error?: string;
        debug?: Record<string, unknown>;
      }>(`/api/channels/feishu/users?refresh=1${agentParam}`);
      if (result.success && result.users) {
        setAllUsers(result.users);
        setScanDebug(result.debug || null);
      } else {
        setUsersError(result.error || t('groups.fetchUsersError'));
      }
    } catch (err) {
      setUsersError(t('groups.fetchUsersError'));
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleUserPicker = (entryId: string) => {
    setShowUserPicker((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
    void fetchAgents();
    if (!allUsers && !usersLoading && !usersError) {
      void fetchUsers();
    }
  };

  const addUserToAllowFrom = (entryId: string, openId: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        const current = e.config.allowFrom || [];
        if (current.includes(openId)) return e;
        return { ...e, config: { ...e.config, allowFrom: [...current, openId] } };
      })
    );
  };

  const removeUserFromAllowFrom = (entryId: string, openId: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        const current = e.config.allowFrom || [];
        return { ...e, config: { ...e.config, allowFrom: current.filter((id) => id !== openId) } };
      })
    );
  };

  const addGroup = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        groupId: '',
        config: {
          enabled: true,
          requireMention: true,
          groupPolicy: 'allowlist',
        },
      },
    ]);
  };

  const removeGroup = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setShowUserPicker((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setUserSearch((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateGroupId = (id: string, newGroupId: string) => {
    const trimmed = newGroupId.trim();
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, groupId: trimmed } : e))
    );
  };

  const updateGroupField = <K extends keyof FeishuGroupConfig>(
    id: string,
    field: K,
    fieldValue: FeishuGroupConfig[K]
  ) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, config: { ...e.config, [field]: fieldValue } }
          : e
      )
    );
  };

  const getFilteredUsers = (entryId: string) => {
    const query = (userSearch[entryId] || '').trim().toLowerCase();
    if (!query || !allUsers) return allUsers || [];
    return allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.openId.toLowerCase().includes(query) ||
        (u.lastMessagePreview || '').toLowerCase().includes(query)
    );
  };

  const isUserSelected = (entryId: string, openId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    return (entry?.config.allowFrom || []).includes(openId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label className={labelClasses}>{t('fields.groups.label')}</Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGroup}
          className="h-8 text-xs font-medium rounded-full px-3 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('groups.addGroup')}
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-8 rounded-2xl bg-surface-input/30 border border-dashed border-black/10 dark:border-white/10">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('groups.emptyHint')}</p>
        </div>
      )}

      <TooltipProvider delayDuration={100}>
        <div className="space-y-3">
          {entries.map((entry) => {
            const config = entry.config;
            const filteredUsers = getFilteredUsers(entry.id);
            const pickerOpen = showUserPicker[entry.id] || false;

            return (
              <div key={entry.id} className={cardClasses}>
                {/* Header: Group ID + Delete */}
                <div className="flex items-center gap-3">
                  <Input
                    value={entry.groupId}
                    onChange={(e) => updateGroupId(entry.id, e.target.value)}
                    placeholder={t('groups.groupIdPlaceholder')}
                    className={cn(inputBaseClasses, 'font-mono text-sm flex-1')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeGroup(entry.id)}
                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Compact toggles row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Enabled */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-foreground">{t('groups.enabled')}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[260px]">
                            <p className="whitespace-normal break-words leading-relaxed">{t('groups.enabledTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <Switch
                      checked={config.enabled !== false}
                      onCheckedChange={(checked) => updateGroupField(entry.id, 'enabled', checked)}
                      className="data-[state=checked]:bg-cyan-500 shrink-0"
                    />
                  </div>

                  {/* Require Mention */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-foreground">{t('groups.requireMention')}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[260px]">
                            <p className="whitespace-normal break-words leading-relaxed">{t('groups.requireMentionTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <Switch
                      checked={config.requireMention !== false}
                      onCheckedChange={(checked) => updateGroupField(entry.id, 'requireMention', checked)}
                      className="data-[state=checked]:bg-cyan-500 shrink-0"
                    />
                  </div>

                  {/* Group Policy */}
                  <div className="relative flex items-center gap-2">
                    <select
                      value={config.groupPolicy || 'allowlist'}
                      onChange={(e) =>
                        updateGroupField(entry.id, 'groupPolicy', e.target.value as FeishuGroupConfig['groupPolicy'])
                      }
                      className={cn(inputBaseClasses, 'h-[42px] px-3 appearance-none w-full pr-10 text-sm')}
                    >
                      <option value="allowlist">{t('groups.policy.allowlist')}</option>
                      <option value="open">{t('groups.policy.open')}</option>
                      <option value="disabled">{t('groups.policy.disabled')}</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[260px]">
                        <p className="whitespace-normal break-words leading-relaxed">{t('groups.policyTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Allow From */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className={cn(labelClasses, 'text-[10px]')}>{t('groups.allowFrom')}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleUserPicker(entry.id)}
                      className="h-6 text-[11px] font-medium px-2 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-500/10"
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      {t('groups.fetchUsers')}
                    </Button>
                  </div>

                  {pickerOpen && (
                    <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Agent selector */}
                      {agents.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Label className={cn(labelClasses, 'text-[10px] shrink-0')}>{t('groups.selectAgent')}</Label>
                          <select
                            value={selectedAgentId}
                            onChange={(e) => {
                              setSelectedAgentId(e.target.value);
                              setAllUsers(null);
                            }}
                            className={cn(inputBaseClasses, 'h-7 px-2 text-xs flex-1')}
                          >
                            <option value="">{t('groups.allAgents')}</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.fileCount})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Search + Scan + Status */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                          <Input
                            value={userSearch[entry.id] || ''}
                            onChange={(e) => setUserSearch((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                            placeholder={t('groups.userSearchPlaceholder')}
                            className={cn(inputBaseClasses, 'h-8 pl-8 text-xs')}
                            disabled={usersLoading || !!usersError || !allUsers}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={fetchUsers}
                          disabled={usersLoading}
                          className="h-7 text-[11px] px-2 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-500/10 shrink-0"
                        >
                          {usersLoading ? (
                            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1" />
                          )}
                          {t('groups.scanUsers')}
                        </Button>
                        {usersError && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={fetchUsers}
                            className="h-7 text-[11px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {t('groups.fetchUsersRetry')}
                          </Button>
                        )}
                      </div>

                      {/* Status messages */}
                      {usersLoading && (
                        <p className="text-xs text-muted-foreground py-1">{t('groups.fetchUsersLoading')}</p>
                      )}
                      {usersError && !usersLoading && (
                        <p className="text-xs text-destructive py-1">{usersError}</p>
                      )}
                      {scanDebug && !usersLoading && !usersError && (
                        <p className="text-[10px] text-muted-foreground/60 py-1 font-mono">
                          扫描: {String(scanDebug.scannedFiles ?? '-')} 个文件
                          {typeof scanDebug.totalFeishuPrompts === 'number' ? ` / ${scanDebug.totalFeishuPrompts} 条飞书记录` : ''}
                          {typeof scanDebug.totalPromptsChecked === 'number' ? ` / ${scanDebug.totalPromptsChecked} 条prompt` : ''}
                        </p>
                      )}

                      {/* User list */}
                      {!usersLoading && !usersError && (
                        <>
                          {allUsers === null && (
                            <p className="text-xs text-muted-foreground py-1">
                              点击「扫描日志」从 OpenClaw 会话中提取已交互的飞书用户
                            </p>
                          )}
                          {allUsers !== null && filteredUsers.length === 0 && (
                            <p className="text-xs text-muted-foreground py-1">
                              {(userSearch[entry.id] || '').trim()
                                ? t('groups.noSearchResults')
                                : t('groups.noUsers')}
                            </p>
                          )}
                          {allUsers !== null && filteredUsers.length > 0 && (
                            <div className="max-h-[180px] overflow-y-auto space-y-1 pr-1">
                              {filteredUsers.map((user) => {
                                const selected = isUserSelected(entry.id, user.openId);
                                return (
                                  <button
                                    key={user.openId}
                                    type="button"
                                    onClick={() =>
                                      selected
                                        ? removeUserFromAllowFrom(entry.id, user.openId)
                                        : addUserToAllowFrom(entry.id, user.openId)
                                    }
                                    className={cn(
                                      'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors',
                                      selected
                                        ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20'
                                        : 'bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-foreground border border-transparent'
                                    )}
                                  >
                                    <div className="flex flex-col items-start min-w-0 gap-0.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        {selected ? (
                                          <Check className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                                        ) : (
                                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                                        )}
                                        <span className="font-medium truncate">{user.name}</span>
                                        {user.agentId ? (
                                          <span className="text-[9px] px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground shrink-0">
                                            {user.agentId}
                                          </span>
                                        ) : null}
                                      </div>
                                      {user.lastMessagePreview ? (
                                        <span className="text-[10px] text-muted-foreground/70 truncate max-w-[200px] ml-5">
                                          {user.lastMessagePreview}
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="font-mono text-[10px] text-muted-foreground truncate ml-2 shrink-0">{user.openId}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <textarea
                    value={(config.allowFrom || []).join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                      updateGroupField(entry.id, 'allowFrom', lines);
                    }}
                    placeholder={t('groups.allowFromPlaceholder')}
                    rows={2}
                    className={cn(
                      inputBaseClasses,
                      'h-auto py-2.5 px-3 resize-none leading-relaxed w-full text-sm font-mono'
                    )}
                    spellCheck={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      {t('fields.groups.description') && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          {t('fields.groups.description')}
        </p>
      )}
    </div>
  );
}
