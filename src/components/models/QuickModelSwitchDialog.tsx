/**
 * QuickModelSwitchDialog
 * Dialog for managing quick-model favorites used to generate /model commands.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clipboard,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { invokeIpc } from '@/lib/api-client';
import { hostApi } from '@/lib/host-api';
import { useProviderStore } from '@/stores/providers';
import {
  buildConfiguredModelOptions,
  type ConfiguredModelOption,
} from '@/lib/model-options';

interface QuickModelRef {
  path: string;
  label: string;
}

interface QuickModelSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickModelSwitchDialog({
  open,
  onOpenChange,
}: QuickModelSwitchDialogProps) {
  const [quickModels, setQuickModels] = useState<QuickModelRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initProviders = useProviderStore((state) => state.init);
  const providerAccounts = useProviderStore((state) => state.accounts);
  const providerStatuses = useProviderStore((state) => state.statuses);
  const providerDefaultAccountId = useProviderStore(
    (state) => state.defaultAccountId,
  );

  useEffect(() => {
    if (open) {
      void initProviders();
    }
  }, [open, initProviders]);

  const loadQuickModels = useCallback(async () => {
    try {
      const settings = await invokeIpc<Record<string, unknown>>(
        'settings:getAll',
        [],
      );
      const refs = settings?.quickModelRefs;
      if (Array.isArray(refs)) {
        setQuickModels(
          refs
            .filter(
              (r): r is QuickModelRef =>
                r !== null &&
                typeof r === 'object' &&
                typeof (r as QuickModelRef).path === 'string' &&
                typeof (r as QuickModelRef).label === 'string',
            )
            .map((r) => ({ path: r.path, label: r.label })),
        );
      }
    } catch (err) {
      console.error('[QuickModelSwitchDialog] Failed to load quick models:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      void loadQuickModels();
      setShowAddDropdown(false);
    }
  }, [open, loadQuickModels]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowAddDropdown(false);
      }
    }
    if (showAddDropdown) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [showAddDropdown]);

  async function persistQuickModels(next: QuickModelRef[]) {
    setSaving(true);
    try {
      // P4b-B2: hostApi.settings.setMany (legacy settings:setMany fallback).
      await hostApi.settings.setMany({ quickModelRefs: next });
      setQuickModels(next);
    } catch (err) {
      toast.error('保存快捷模型失败');
      console.error('[QuickModelSwitchDialog] Failed to save quick models:', err);
    } finally {
      setSaving(false);
    }
  }

  async function addQuickModel(option: ConfiguredModelOption) {
    if (quickModels.some((m) => m.path === option.modelRef)) {
      toast.info('该模型已在快捷列表中');
      setShowAddDropdown(false);
      return;
    }
    const next = [
      ...quickModels,
      { path: option.modelRef, label: option.label },
    ];
    await persistQuickModels(next);
    setShowAddDropdown(false);
    toast.success('已添加快捷模型');
  }

  async function removeQuickModel(path: string) {
    const next = quickModels.filter((m) => m.path !== path);
    await persistQuickModels(next);
    toast.success('已移除快捷模型');
  }

  async function copyQuickModelCommand(path: string) {
    const command = `/model ${path}`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = command;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast.success(`已复制: ${command}`);
  }

  const availableOptions = useMemo(
    () =>
      buildConfiguredModelOptions(
        providerAccounts,
        providerStatuses,
        providerDefaultAccountId,
      ),
    [providerAccounts, providerStatuses, providerDefaultAccountId],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <Card className="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <CardHeader className="shrink-0 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">快捷模型切换</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-2 -mt-1 rounded-full"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            收藏常用模型并复制 /model 指令，粘贴到飞书即可切换 Agent 大模型
          </p>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              加载快捷模型...
            </div>
          ) : quickModels.length === 0 && availableOptions.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              请先在 AI 服务商中配置模型
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              <div className="space-y-1.5">
                {quickModels.map((qm) => (
                  <div
                    key={qm.path}
                    className="group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:border-primary/30"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {qm.label}
                      </span>
                      <span className="block truncate font-mono text-muted-foreground">
                        {qm.path}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="复制 /model 命令"
                        onClick={() => void copyQuickModelCommand(qm.path)}
                      >
                        <Clipboard className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="移除"
                        onClick={() => void removeQuickModel(qm.path)}
                        disabled={saving}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {quickModels.length === 0 && (
                  <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                    尚未添加快捷模型
                  </div>
                )}
              </div>

              <div ref={containerRef} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-1"
                  onClick={() => setShowAddDropdown((v) => !v)}
                  disabled={saving || availableOptions.length === 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加快捷模型
                  <ChevronDown
                    className={cn(
                      'ml-auto h-3.5 w-3.5 transition-transform',
                      showAddDropdown && 'rotate-180',
                    )}
                  />
                </Button>

                {showAddDropdown && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-56 overflow-y-auto">
                    {availableOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        没有可用的模型
                      </div>
                    ) : (
                      availableOptions.map((option) => {
                        const alreadyAdded = quickModels.some(
                          (m) => m.path === option.modelRef,
                        );
                        return (
                          <div
                            key={option.modelRef}
                            onClick={() => {
                              if (alreadyAdded) return;
                              void addQuickModel(option);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm',
                              alreadyAdded
                                ? 'bg-muted text-muted-foreground'
                                : 'hover:bg-accent',
                            )}
                          >
                            {alreadyAdded ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">
                                {option.label}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {option.modelRef}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Badge variant="secondary" className="text-[10px]">
                  {quickModels.length} 个收藏
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  完成
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
