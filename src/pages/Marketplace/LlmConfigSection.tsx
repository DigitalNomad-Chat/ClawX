/**
 * LLM Config Section — Provider management UI embedded in Marketplace page
 * Shows configured providers, active status, and quick actions
 */
import { useEffect, useState, useCallback } from 'react';
import { Plus, Check, Trash2, Settings2, Loader2, Zap, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type KernelLLMConfig,
  type KernelLLMProvider,
  kernelLlmConfig,
} from '@/lib/kernel-llm-config';
import { AddProviderDialog } from './AddProviderDialog';
import { ImportFromOpenClawDialog } from './ImportFromOpenClawDialog';

export function LlmConfigSection() {
  const [config, setConfig] = useState<KernelLLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeCheck, setActiveCheck] = useState<{
    providerName?: string;
    model?: string;
    configured: boolean;
  }>({ configured: false });

  const loadConfig = useCallback(async () => {
    try {
      const result = await kernelLlmConfig.readConfig();
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch (err) {
      console.error('[LlmConfigSection] Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkActive = useCallback(async () => {
    try {
      const result = await kernelLlmConfig.checkActive();
      setActiveCheck({
        providerName: result.providerName,
        model: result.model,
        configured: result.success,
      });
    } catch {
      setActiveCheck({ configured: false });
    }
  }, []);

  useEffect(() => {
    loadConfig();
    checkActive();
  }, [loadConfig, checkActive]);

  async function handleSetActive(providerId: string, model: string) {
    const result = await kernelLlmConfig.setActive(providerId, model);
    if (result.success && result.config) {
      setConfig(result.config);
      // Hot-update running kernel
      await kernelLlmConfig.updateProviderConfig().catch(() => {});
      await checkActive();
    }
  }

  async function handleDelete(providerId: string) {
    const result = await kernelLlmConfig.deleteProvider(providerId);
    if (result.success && result.config) {
      setConfig(result.config);
      await kernelLlmConfig.updateProviderConfig().catch(() => {});
      await checkActive();
    }
  }

  function handleSaved() {
    loadConfig();
    checkActive();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载 AI 配置...
      </div>
    );
  }

  const providers = config?.providers || [];
  const activeConfig = config?.active;

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI 模型配置</h2>
          {activeCheck.configured ? (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              已就绪
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              未配置
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
            <Download className="mr-1 h-3 w-3" />
            导入
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-1 h-3 w-3" />
            添加
          </Button>
        </div>
      </div>

      {/* Status bar */}
      {activeCheck.configured ? (
        <div className="flex items-center gap-2 bg-green-50 px-4 py-2 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
          <Check className="h-3 w-3" />
          <span>
            当前使用: {activeCheck.providerName} / {activeCheck.model}
          </span>
        </div>
      ) : providers.length === 0 ? (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertCircle className="h-3 w-3" />
          <span>请添加一个 AI 服务商，然后才能与 Agent 对话</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertCircle className="h-3 w-3" />
          <span>请选择一个服务商作为默认</span>
        </div>
      )}

      {/* Provider cards */}
      {providers.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => {
            const isActive = activeConfig?.providerId === provider.id;
            const activeModel = isActive ? activeConfig.model : provider.models[0];

            return (
              <div
                key={provider.id}
                className={cn(
                  'relative flex flex-col gap-2 rounded-lg border p-3 transition-all',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/30',
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                )}

                {/* Provider info */}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold',
                      isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {provider.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{provider.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {provider.api === 'anthropic' ? 'Anthropic' : 'OpenAI'} API
                    </p>
                  </div>
                </div>

                {/* Model selector */}
                <div className="flex flex-wrap gap-1">
                  {provider.models.slice(0, 3).map((model) => (
                    <button
                      key={model}
                      onClick={() => handleSetActive(provider.id, model)}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] transition-all',
                        isActive && activeModel === model
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {model}
                    </button>
                  ))}
                  {provider.models.length > 3 && (
                    <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      +{provider.models.length - 3}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 border-t pt-2">
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => handleSetActive(provider.id, provider.models[0])}
                    >
                      设为默认
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => handleDelete(provider.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-muted-foreground">
          <Settings2 className="h-8 w-8" />
          <p className="text-sm">尚未配置任何 AI 服务商</p>
          <p className="text-xs">点击上方「添加」按钮开始配置</p>
        </div>
      )}

      {/* Add Provider Dialog */}
      <AddProviderDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={handleSaved}
      />

      {/* Import from OpenClaw Dialog */}
      <ImportFromOpenClawDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImported={handleSaved}
      />
    </div>
  );
}
