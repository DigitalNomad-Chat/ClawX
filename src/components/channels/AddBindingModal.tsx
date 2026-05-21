import { useState, useEffect } from 'react';
import {
  X,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  CHANNEL_NAMES,
  getPrimaryChannels,
  type BindingRequest,
  type BindingInfo,
  type RoutingMode,
  type BindingType,
  ROUTING_MODE_OPTIONS,
  BINDING_TYPE_OPTIONS,
  PEER_KIND_OPTIONS,
} from '@/types/channel';
import { useTranslation } from 'react-i18next';

interface AddBindingModalProps {
  agents: { id: string; name: string }[];
  /** 可选：预填充 agentId（从快速绑定传入） */
  initialAgentId?: string;
  /** 可选：编辑模式，传入现有 binding 数据 */
  editBinding?: BindingInfo;
  onConfirm: (request: BindingRequest) => void | Promise<void>;
  onClose: () => void;
}

const inputBaseClasses = 'h-11 rounded-xl bg-surface-input border-black/10 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 shadow-sm transition-all text-foreground placeholder:text-foreground/30';
const labelClasses = 'text-xs font-bold uppercase tracking-widest text-foreground/70';
const outlineButtonClasses = 'h-9 text-meta font-medium rounded-full px-4 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 shadow-none text-foreground/80 hover:text-foreground';
const primaryButtonClasses = 'h-9 text-meta font-medium rounded-full px-4 shadow-none';

export function AddBindingModal({
  agents,
  initialAgentId,
  editBinding,
  onConfirm,
  onClose,
}: AddBindingModalProps) {
  const { t } = useTranslation('channels');
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [agentId, setAgentId] = useState(editBinding?.agentId || initialAgentId || '');
  const [channel, setChannel] = useState(editBinding?.channel || '');
  const [routingMode, setRoutingMode] = useState<RoutingMode>(editBinding?.routingMode || 'peer');
  const [bindingType, setBindingType] = useState<BindingType>(editBinding?.bindingType || 'route');
  const [accountId, setAccountId] = useState(editBinding?.accountId || '');
  const [peerKind, setPeerKind] = useState(editBinding?.peerKind || 'dm');
  const [peerId, setPeerId] = useState(editBinding?.peerId || '');
  const [comment, setComment] = useState(editBinding?.comment || '');
  const [acpEndpoint, setAcpEndpoint] = useState(editBinding?.acp?.endpoint || '');
  const [acpProtocol, setAcpProtocol] = useState(editBinding?.acp?.protocol || '');
  const [acpCapabilities, setAcpCapabilities] = useState(
    editBinding?.acp?.capabilities?.join(', ') || ''
  );

  const isEdit = Boolean(editBinding);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const validate = (): string | null => {
    if (!agentId.trim()) return t('bindingManage.fields.agentPlaceholder');
    if (!channel.trim()) return t('bindingManage.fields.channelPlaceholder');
    if ((routingMode === 'peer' || routingMode === 'both') && !peerId.trim()) {
      return t('bindingManage.fields.peerIdPlaceholder');
    }
    if ((routingMode === 'accountId' || routingMode === 'both') && !accountId.trim()) {
      return t('bindingManage.fields.accountIdPlaceholder');
    }
    if (bindingType === 'acp' && !acpEndpoint.trim()) {
      return t('bindingManage.fields.acpEndpointPlaceholder');
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      // 简单提示，实际可用 toast
      return;
    }

    setSaving(true);
    try {
      const request: BindingRequest = {
        agentId: agentId.trim(),
        channel: channel.trim(),
        routingMode,
        accountId: accountId.trim() || undefined,
        peerKind: peerKind as 'dm' | 'group',
        peerId: peerId.trim() || undefined,
        comment: comment.trim() || undefined,
        bindingType,
      };

      if (bindingType === 'acp' && acpEndpoint.trim()) {
        request.acp = {
          endpoint: acpEndpoint.trim(),
          protocol: acpProtocol.trim() || undefined,
          capabilities: acpCapabilities
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }

      await onConfirm(request);
    } finally {
      setSaving(false);
    }
  };

  const showAccountIdField = routingMode === 'accountId' || routingMode === 'both';
  const showPeerFields = routingMode === 'peer' || routingMode === 'both';
  const showAcpFields = bindingType === 'acp';

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300',
        mounted ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0'
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card
        className={cn(
          'w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border-0 shadow-2xl bg-surface-modal overflow-hidden transition-all duration-300 ease-out',
          mounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.96] translate-y-4'
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="relative flex flex-row items-start justify-between pb-4 shrink-0 overflow-hidden">
          {/* 顶部品牌色光带 */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
          {/* 右上角辉光 */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-[0.08] blur-3xl pointer-events-none bg-cyan-500" />
          <div className="relative z-10 pt-1 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                {isEdit ? t('bindingManage.editBinding') : t('bindingManage.addBinding')}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isEdit ? t('bindingManage.subtitle') : t('bindingManage.subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={saving}
            className="relative z-10 rounded-full h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-5 pt-2 overflow-y-auto flex-1 p-6">
          {/* Agent 选择 */}
          <div className="space-y-2.5">
            <Label className={labelClasses}>{t('bindingManage.fields.agent')}</Label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={saving || (isEdit && Boolean(initialAgentId))}
              className={cn(inputBaseClasses, 'w-full px-3')}
            >
              <option value="">{t('bindingManage.fields.agentPlaceholder')}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name !== agent.id ? `${agent.name} (${agent.id})` : agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* 渠道选择 */}
          <div className="space-y-2.5">
            <Label className={labelClasses}>{t('bindingManage.fields.channel')}</Label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              disabled={saving}
              className={cn(inputBaseClasses, 'w-full px-3')}
            >
              <option value="">{t('bindingManage.fields.channelPlaceholder')}</option>
              {getPrimaryChannels().map((type) => (
                <option key={type} value={type}>
                  {CHANNEL_NAMES[type] || type}
                </option>
              ))}
            </select>
          </div>

          <Separator className="my-2 bg-border/50" />

          {/* 路由模式 */}
          <div className="space-y-2.5">
            <Label className={labelClasses}>{t('bindingManage.fields.routingMode')}</Label>
            <div className="flex gap-2">
              {ROUTING_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRoutingMode(opt.value)}
                  disabled={saving}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                    routingMode === opt.value
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                      : 'border-black/10 dark:border-white/10 bg-surface-input text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5'
                  )}
                >
                  <span className="block text-sm font-semibold">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 绑定类型 */}
          <div className="space-y-2.5">
            <Label className={labelClasses}>{t('bindingManage.fields.bindingType')}</Label>
            <div className="flex gap-2">
              {BINDING_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBindingType(opt.value)}
                  disabled={saving}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                    bindingType === opt.value
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                      : 'border-black/10 dark:border-white/10 bg-surface-input text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5'
                  )}
                >
                  <span className="block text-sm font-semibold">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 条件字段 */}
          {showAccountIdField && (
            <div className="space-y-2.5">
              <Label className={labelClasses}>{t('bindingManage.fields.accountId')}</Label>
              <Input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder={t('bindingManage.fields.accountIdPlaceholder')}
                disabled={saving}
                className={inputBaseClasses}
              />
            </div>
          )}

          {showPeerFields && (
            <>
              <div className="space-y-2.5">
                <Label className={labelClasses}>{t('bindingManage.fields.peerKind')}</Label>
                <div className="flex gap-2">
                  {PEER_KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPeerKind(opt.value)}
                      disabled={saving}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                        peerKind === opt.value
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-black/10 dark:border-white/10 bg-surface-input text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2.5">
                <Label className={labelClasses}>{t('bindingManage.fields.peerId')}</Label>
                <Input
                  value={peerId}
                  onChange={(e) => setPeerId(e.target.value)}
                  placeholder={t('bindingManage.fields.peerIdPlaceholder')}
                  disabled={saving}
                  className={inputBaseClasses}
                />
              </div>
            </>
          )}

          {showAcpFields && (
            <>
              <Separator className="my-2 bg-border/50" />
              <div className="space-y-2.5">
                <Label className={labelClasses}>{t('bindingManage.fields.acpEndpoint')}</Label>
                <Input
                  value={acpEndpoint}
                  onChange={(e) => setAcpEndpoint(e.target.value)}
                  placeholder={t('bindingManage.fields.acpEndpointPlaceholder')}
                  disabled={saving}
                  className={inputBaseClasses}
                />
              </div>
              <div className="space-y-2.5">
                <Label className={labelClasses}>{t('bindingManage.fields.acpProtocol')}</Label>
                <Input
                  value={acpProtocol}
                  onChange={(e) => setAcpProtocol(e.target.value)}
                  placeholder="例如: a2a, mcp"
                  disabled={saving}
                  className={inputBaseClasses}
                />
              </div>
              <div className="space-y-2.5">
                <Label className={labelClasses}>{t('bindingManage.fields.acpCapabilities')}</Label>
                <Input
                  value={acpCapabilities}
                  onChange={(e) => setAcpCapabilities(e.target.value)}
                  placeholder="例如: chat, tools, memory (逗号分隔)"
                  disabled={saving}
                  className={inputBaseClasses}
                />
              </div>
            </>
          )}

          {/* 备注 */}
          <div className="space-y-2.5">
            <Label className={labelClasses}>{t('bindingManage.fields.comment')}</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('bindingManage.fields.commentPlaceholder')}
              disabled={saving}
              className={inputBaseClasses}
            />
          </div>

          {/* 底部操作按钮 */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className={outlineButtonClasses}
            >
              {t('dialog.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className={cn(primaryButtonClasses, 'bg-cyan-600 hover:bg-cyan-700 text-white')}
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">⚙</span>
                  {t('dialog.saving')}
                </>
              ) : isEdit ? (
                t('dialog.save')
              ) : (
                t('dialog.add')
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
