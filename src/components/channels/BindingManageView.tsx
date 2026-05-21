import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Link2,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Zap,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import {
  CHANNEL_NAMES,
  type BindingInfo,
  type BindingRequest,
} from '@/types/channel';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AddBindingModal } from './AddBindingModal';

interface BindingManageViewProps {
  agents: { id: string; name: string }[];
  onBack: () => void;
}

export function BindingManageView({ agents, onBack }: BindingManageViewProps) {
  const { t } = useTranslation('channels');
  const [bindings, setBindings] = useState<BindingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editBinding, setEditBinding] = useState<BindingInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BindingInfo | null>(null);
  const [quickBindAgentId, setQuickBindAgentId] = useState<string | undefined>();

  const fetchBindings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await hostApiFetch<{
        success: boolean;
        bindings?: BindingInfo[];
        error?: string;
      }>('/api/bindings');
      if (res?.success && Array.isArray(res.bindings)) {
        setBindings(res.bindings);
      } else {
        setBindings([]);
      }
    } catch (err) {
      console.error('Failed to fetch bindings:', err);
      setBindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  const unboundAgents = useMemo(() => {
    const boundAgentIds = new Set(bindings.map((b) => b.agentId));
    return agents.filter((a) => !boundAgentIds.has(a.id));
  }, [agents, bindings]);

  const groupedBindings = useMemo(() => {
    const map = new Map<string, BindingInfo[]>();
    for (const binding of bindings) {
      const list = map.get(binding.channel) || [];
      list.push(binding);
      map.set(binding.channel, list);
    }
    return map;
  }, [bindings]);

  const handleAdd = async (request: BindingRequest) => {
    try {
      const res = await hostApiFetch<{
        success: boolean;
        error?: string;
      }>('/api/bindings', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (res?.success) {
        toast.success(t('bindingManage.bindingSaved'));
        setShowAddModal(false);
        setQuickBindAgentId(undefined);
        await fetchBindings();
      } else {
        toast.error(t('bindingManage.bindingFailed', { error: res?.error || 'Unknown' }));
      }
    } catch (err) {
      toast.error(t('bindingManage.bindingFailed', { error: String(err) }));
    }
  };

  const handleEdit = async (request: BindingRequest) => {
    if (!editBinding) return;
    try {
      const res = await hostApiFetch<{
        success: boolean;
        error?: string;
      }>(`/api/bindings/${editBinding.index}`, {
        method: 'PUT',
        body: JSON.stringify(request),
      });
      if (res?.success) {
        toast.success(t('bindingManage.bindingSaved'));
        setEditBinding(null);
        await fetchBindings();
      } else {
        toast.error(t('bindingManage.bindingFailed', { error: res?.error || 'Unknown' }));
      }
    } catch (err) {
      toast.error(t('bindingManage.bindingFailed', { error: String(err) }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await hostApiFetch<{
        success: boolean;
        error?: string;
      }>(`/api/bindings/${deleteTarget.index}`, {
        method: 'DELETE',
      });
      if (res?.success) {
        toast.success(t('bindingManage.bindingDeleted'));
        setDeleteTarget(null);
        await fetchBindings();
      } else {
        toast.error(t('bindingManage.bindingFailed', { error: res?.error || 'Unknown' }));
      }
    } catch (err) {
      toast.error(t('bindingManage.bindingFailed', { error: String(err) }));
    }
  };

  const openQuickBind = (agentId: string) => {
    setQuickBindAgentId(agentId);
    setShowAddModal(true);
  };

  const openAdd = () => {
    setQuickBindAgentId(undefined);
    setEditBinding(null);
    setShowAddModal(true);
  };

  const openEdit = (binding: BindingInfo) => {
    setEditBinding(binding);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setQuickBindAgentId(undefined);
    setEditBinding(null);
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? (agent.name !== agent.id ? `${agent.name} (${agent.id})` : agent.name) : agentId;
  };

  const getRoutingModeLabel = (mode: string) => {
    switch (mode) {
      case 'peer':
        return t('bindingManage.labels.peer');
      case 'accountId':
        return t('bindingManage.labels.account');
      case 'both':
        return t('bindingManage.labels.both');
      default:
        return mode;
    }
  };

  const getBindingTypeLabel = (type: string) => {
    switch (type) {
      case 'route':
        return t('bindingManage.labels.route');
      case 'acp':
        return t('bindingManage.labels.acp');
      default:
        return type;
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      {/* 头部区域 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('bindingManage.back')}
          </Button>
          <div className="h-8 w-[1px] bg-border" />
          <Radio className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t('bindingManage.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('bindingManage.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* 未绑定 Agent 提醒横幅 */}
      {unboundAgents.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {t('bindingManage.unboundWarning', { count: unboundAgents.length })}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {unboundAgents.map((agent) => (
                    <Button
                      key={agent.id}
                      variant="outline"
                      size="sm"
                      onClick={() => openQuickBind(agent.id)}
                      className="rounded-full border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 text-xs"
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      {agent.name !== agent.id ? `${agent.name} (${agent.id})` : agent.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 绑定列表 */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            {t('loading')}
          </div>
        ) : bindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
            <Link2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t('bindingManage.noBindings')}</p>
          </div>
        ) : (
          Array.from(groupedBindings.entries()).map(([channelType, channelBindings]) => (
            <div key={channelType} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                    {(CHANNEL_NAMES as Record<string, string>)[channelType] || channelType}
                  </span>
                  <Badge variant="secondary" className="text-xs rounded-full">
                    {channelBindings.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {channelBindings.map((binding) => (
                    <Card
                      key={binding.index}
                      className="border border-black/5 dark:border-white/5 bg-surface-input hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs rounded-full',
                                  binding.routingMode === 'peer'
                                    ? 'border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                                    : binding.routingMode === 'accountId'
                                      ? 'border-violet-500/30 text-violet-700 dark:text-violet-300'
                                      : 'border-amber-500/30 text-amber-700 dark:text-amber-300'
                                )}
                              >
                                {getRoutingModeLabel(binding.routingMode)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs rounded-full',
                                  binding.bindingType === 'acp'
                                    ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                    : 'border-slate-500/30 text-slate-700 dark:text-slate-300'
                                )}
                              >
                                {getBindingTypeLabel(binding.bindingType)}
                              </Badge>
                              {binding.comment && (
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {binding.comment}
                                </span>
                              )}
                            </div>

                            <div className="text-sm text-foreground">
                              <span className="font-medium">Agent: </span>
                              {getAgentName(binding.agentId)}
                            </div>

                            {binding.routingMode !== 'peer' && binding.accountId && (
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium">Account: </span>
                                {binding.accountId}
                              </div>
                            )}

                            {(binding.routingMode === 'peer' || binding.routingMode === 'both') &&
                              binding.peerId && (
                                <div className="text-sm text-muted-foreground">
                                  <span className="font-medium">Peer: </span>
                                  {binding.peerKind === 'group' ? 'Group' : 'DM'} — {binding.peerId}
                                </div>
                              )}

                            {binding.bindingType === 'acp' && binding.acp?.endpoint && (
                              <div className="text-sm text-muted-foreground truncate">
                                <span className="font-medium">Endpoint: </span>
                                {binding.acp.endpoint}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(binding)}
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(binding)}
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
      </div>

      {/* 底部添加按钮 */}
      <div className="flex justify-end">
        <Button
          onClick={openAdd}
          className="rounded-full bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('bindingManage.addBinding')}
        </Button>
      </div>

      {/* 添加/编辑弹窗 */}
      {showAddModal && (
        <AddBindingModal
          agents={agents}
          initialAgentId={quickBindAgentId}
          editBinding={editBinding || undefined}
          onConfirm={editBinding ? handleEdit : handleAdd}
          onClose={closeModal}
        />
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('bindingManage.deleteBinding')}
        message={t('bindingManage.deleteConfirm')}
        confirmLabel={t('dialog.delete')}
        cancelLabel={t('dialog.cancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
