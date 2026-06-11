/**
 * GoClaw - 模型配置页面
 * 管理独立内核的 LLM 服务商：添加、编辑、删除、设置默认、测试连接、导入
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Check, Trash2, Settings2, Loader2, AlertCircle, Download,
  Pencil, Cpu, TestTube, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type KernelLLMConfig,
  type KernelLLMProvider,
  kernelLlmConfig,
} from '@/lib/kernel-llm-config';
import { AddProviderDialog } from '@/pages/Marketplace/AddProviderDialog';
import { ImportFromOpenClawDialog } from '@/pages/Marketplace/ImportFromOpenClawDialog';

export function GoClawModels() {
  const [config, setConfig] = useState<KernelLLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<KernelLLMProvider | undefined>(undefined);
  const [activeCheck, setActiveCheck] = useState<{
    providerName?: string;
    model?: string;
    configured: boolean;
  }>({ configured: false });
  const [testingMap, setTestingMap] = useState<Record<string, { status: 'running' | 'success' | 'error'; message?: string }>>({});

  const loadConfig = useCallback(async () => {
    try {
      const result = await kernelLlmConfig.readConfig();
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch (err) {
      console.error('[GoClawModels] Failed to load config:', err);
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

  async function handleTest(provider: KernelLLMProvider, model: string) {
    setTestingMap((prev) => ({
      ...prev,
      [provider.id]: { status: 'running' },
    }));
    try {
      const result = await kernelLlmConfig.testConnection(provider.api, provider.baseUrl, provider.apiKey, model);
      setTestingMap((prev) => ({
        ...prev,
        [provider.id]: {
          status: result.success ? 'success' : 'error',
          message: result.success
            ? `连接成功 (${result.latency}ms)`
            : result.error || '连接失败',
        },
      }));
    } catch (err) {
      setTestingMap((prev) => ({
        ...prev,
        [provider.id]: { status: 'error', message: (err as Error).message || '测试异常' },
      }));
    }
  }

  function handleSaved() {
    loadConfig();
    checkActive();
    setEditingProvider(undefined);
    setShowAddDialog(false);
  }

  function handleEdit(provider: KernelLLMProvider) {
    setEditingProvider(provider);
    setShowAddDialog(true);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        加载 AI 模型配置...
      </div>
    );
  }

  const providers = config?.providers || [];
  const activeConfig = config?.active;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Cpu className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">模型配置</h1>
            <p className="text-sm text-muted-foreground">
              配置 Agent 使用的 AI 服务商和默认模型
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadConfig(); checkActive(); }}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Download className="h-4 w-4 mr-1.5" />
            导入
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            添加服务商
          </Button>
        </div>
      </div>

      {/* Status card */}
      <div
        className={cn(
          'rounded-xl border px-4 py-3 flex items-center gap-3',
          activeCheck.configured
            ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
            : 'bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900'
        )}
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            activeCheck.configured ? 'bg-green-100 text-green-700 dark:bg-green-900/40' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40'
          )}
        >
          {activeCheck.configured ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p className={cn('text-sm font-medium', activeCheck.configured ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300')}>
            {activeCheck.configured
              ? `当前已配置：${activeCheck.providerName} / ${activeCheck.model}`
              : providers.length === 0
              ? '尚未配置任何 AI 服务商'
              : '请选择一个服务商作为默认'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCheck.configured
              ? 'Agent 可以正常使用该模型进行对话'
              : '添加并激活服务商后，才能与 Agent 开始对话'}
          </p>
        </div>
      </div>

      {/* Provider grid */}
      {providers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Settings2 className="h-10 w-10" />
          <p className="text-sm">尚未配置任何 AI 服务商</p>
          <p className="text-xs">点击上方「添加服务商」或「导入」开始配置</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const isActive = activeConfig?.providerId === provider.id;
            const activeModel = isActive ? activeConfig.model : provider.models[0];
            const testState = testingMap[provider.id];

            return (
              <div
                key={provider.id}
                className={cn(
                  'relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all',
                  isActive
                    ? 'border-primary bg-primary/[0.03]'
                    : 'hover:border-primary/30'
                )}
              >
                {isActive && (
                  <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                    <Check className="h-3 w-3" />
                  </div>
                )}

                {/* Provider info */}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                      isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {provider.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{provider.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {provider.api === 'anthropic' ? 'Anthropic' : 'OpenAI'} API · {provider.baseUrl}
                    </p>
                  </div>
                </div>

                {/* Models */}
                <div className="flex flex-wrap gap-1">
                  {provider.models.slice(0, 4).map((model) => (
                    <button
                      key={model}
                      onClick={() => handleSetActive(provider.id, model)}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                        isActive && activeModel === model
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {model}
                    </button>
                  ))}
                  {provider.models.length > 4 && (
                    <span className="px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      +{provider.models.length - 4}
                    </span>
                  )}
                </div>

                {/* Test status */}
                {testState && (
                  <div
                    className={cn(
                      'rounded-md px-2.5 py-1 text-[11px] flex items-center gap-1.5',
                      testState.status === 'success' && 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
                      testState.status === 'error' && 'bg-destructive/10 text-destructive',
                      testState.status === 'running' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {testState.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {testState.status === 'success' && <Check className="h-3 w-3" />}
                    {testState.status === 'error' && <AlertCircle className="h-3 w-3" />}
                    {testState.message}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-2 flex items-center gap-1 border-t">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleTest(provider, activeModel || provider.models[0])}
                    disabled={testState?.status === 'running'}
                  >
                    <TestTube className="h-3 w-3 mr-1" />
                    测试
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleEdit(provider)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                    onClick={() => handleDelete(provider.id)}
                    disabled={isActive && providers.length === 1}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    删除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddProviderDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setEditingProvider(undefined);
        }}
        editProvider={editingProvider}
        onSaved={handleSaved}
      />

      <ImportFromOpenClawDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImported={handleSaved}
      />
    </div>
  );
}
