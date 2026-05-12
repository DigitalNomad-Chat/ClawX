/**
 * Import from OpenClaw Dialog
 * Discovers providers from OpenClaw's store and lets user select which to import.
 */
import { useState, useCallback } from 'react';
import { Download, Loader2, Check, AlertCircle, Key, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  type OpenClawProviderSummary,
  kernelLlmConfig,
} from '@/lib/kernel-llm-config';

interface ImportFromOpenClawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportFromOpenClawDialog({
  open,
  onOpenChange,
  onImported,
}: ImportFromOpenClawDialogProps) {
  const [providers, setProviders] = useState<OpenClawProviderSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const discover = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImportResult(null);
    setSelectedIds(new Set());
    try {
      const result = await kernelLlmConfig.discoverOpenClaw();
      if (result.success) {
        setProviders(result.providers || []);
        // Auto-select all providers with API keys
        const withKeys = (result.providers || []).filter((p) => p.hasApiKey);
        setSelectedIds(new Set(withKeys.map((p) => p.id)));
      } else {
        setError(result.error || '无法读取 OpenClaw 配置');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setImporting(true);
    setError(null);
    try {
      const result = await kernelLlmConfig.importFromOpenClaw([...selectedIds]);
      if (result.success) {
        setImportResult({ imported: result.imported || 0, skipped: result.skipped || 0 });
        onImported();
      } else {
        setError(result.error || '导入失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }, [selectedIds, onImported]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const importable = providers.filter((p) => p.hasApiKey);
    if (selectedIds.size === importable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(importable.map((p) => p.id)));
    }
  };

  const handleClose = () => {
    setProviders([]);
    setSelectedIds(new Set());
    setError(null);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            从 OpenClaw 导入
          </SheetTitle>
          <SheetDescription>
            检测 OpenClaw 已配置的 AI 服务商，选择要导入的配置
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Load providers on open */}
          {!loading && providers.length === 0 && !error && !importResult && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Server className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                点击下方按钮检测 OpenClaw 已配置的服务商
              </p>
              <Button onClick={discover}>
                <Download className="mr-2 h-4 w-4" />
                检测 OpenClaw 配置
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">正在检测...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Import success result */}
          {importResult && (
            <div className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">导入完成</p>
                <p className="text-xs">
                  成功导入 {importResult.imported} 个服务商
                  {importResult.skipped > 0 && `，跳过 ${importResult.skipped} 个（缺少 API Key）`}
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={handleClose}>
                  完成
                </Button>
              </div>
            </div>
          )}

          {/* Provider list */}
          {providers.length > 0 && !importResult && (
            <>
              {/* Select all toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  检测到 {providers.length} 个服务商
                  （{providers.filter((p) => p.hasApiKey).length} 个有 API Key）
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={toggleAll}
                >
                  {selectedIds.size === providers.filter((p) => p.hasApiKey).length
                    ? '取消全选'
                    : '全选'}
                </Button>
              </div>

              {/* Provider cards */}
              <div className="space-y-2">
                {providers.map((provider) => {
                  const isSelected = selectedIds.has(provider.id);
                  const canImport = provider.hasApiKey;

                  return (
                    <button
                      key={provider.id}
                      onClick={() => canImport && toggleSelect(provider.id)}
                      disabled={!canImport}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-all',
                        canImport
                          ? 'cursor-pointer hover:border-primary/50'
                          : 'cursor-not-allowed opacity-50',
                        isSelected && 'border-primary bg-primary/5',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30',
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{provider.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({provider.api === 'anthropic' ? 'Anthropic' : 'OpenAI'} API)
                            </span>
                          </div>

                          {/* Base URL */}
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {provider.baseUrl || '(未设置)'}
                          </p>

                          {/* API Key status */}
                          <div className="mt-1 flex items-center gap-1.5">
                            <Key className="h-3 w-3 text-muted-foreground" />
                            {provider.hasApiKey ? (
                              <span className="text-[11px] text-green-600 dark:text-green-400">
                                {provider.maskedApiKey}
                              </span>
                            ) : (
                              <span className="text-[11px] text-blue-600 dark:text-blue-400">
                                无 API Key（不可导入）
                              </span>
                            )}
                          </div>

                          {/* Models */}
                          {provider.models.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {provider.models.slice(0, 4).map((model) => (
                                <span
                                  key={model}
                                  className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {model}
                                </span>
                              ))}
                              {provider.models.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{provider.models.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={handleClose}>
                  取消
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedIds.size === 0 || importing}
                >
                  {importing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  导入选中 ({selectedIds.size})
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
