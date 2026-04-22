/**
 * Add Provider Dialog — Two-step wizard for adding a new LLM provider
 * Step 1: Select a built-in brand
 * Step 2: Enter API Key, select model, customize
 */
import { useState, useMemo } from 'react';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Check,
  ExternalLink,
  Globe,
  Building2,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  type BuiltInProvider,
  type KernelApiType,
  type KernelLLMProvider,
  BUILT_IN_PROVIDERS,
  kernelLlmConfig,
} from '@/lib/kernel-llm-config';
import { cn } from '@/lib/utils';

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, edit mode — pre-fill from this provider */
  editProvider?: KernelLLMProvider;
  onSaved: () => void;
}

export function AddProviderDialog({
  open,
  onOpenChange,
  editProvider,
  onSaved,
}: AddProviderDialogProps) {
  const [step, setStep] = useState<'brand' | 'config'>(editProvider ? 'config' : 'brand');
  const [selectedBrand, setSelectedBrand] = useState<BuiltInProvider | null>(
    () => {
      if (editProvider) {
        return BUILT_IN_PROVIDERS.find((b) => b.id === editProvider.id) || null;
      }
      return null;
    },
  );

  // Config fields
  const [customName, setCustomName] = useState(editProvider?.name || '');
  const [baseUrl, setBaseUrl] = useState(editProvider?.baseUrl || '');
  const [apiKey, setApiKey] = useState(editProvider?.apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState(editProvider?.models[0] || '');
  const [customModel, setCustomModel] = useState('');

  // States
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = [
      { key: 'intl' as const, label: '国际', icon: <Globe className="h-4 w-4" /> },
      { key: 'cn' as const, label: '国内', icon: <Building2 className="h-4 w-4" /> },
      { key: 'platform' as const, label: '平台', icon: <Server className="h-4 w-4" /> },
    ];
    return cats;
  }, []);

  function selectBrand(brand: BuiltInProvider) {
    setSelectedBrand(brand);
    if (!editProvider) {
      setCustomName(brand.name);
      setBaseUrl(brand.baseUrl);
      setSelectedModel(brand.defaultModels[0] || '');
      setCustomModel('');
    }
    setStep('config');
    setTestResult(null);
    setError(null);
  }

  async function testConnection() {
    if (!selectedBrand || !apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await kernelLlmConfig.testConnection(
        selectedBrand.api,
        baseUrl,
        apiKey.trim(),
        getEffectiveModel(),
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  function getEffectiveModel(): string {
    return customModel.trim() || selectedModel;
  }

  async function save() {
    if (!selectedBrand || !apiKey.trim()) return;
    const model = getEffectiveModel();
    if (!model) {
      setError('请选择或输入模型名称');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const provider: KernelLLMProvider = {
        id: selectedBrand.id,
        name: customName.trim() || selectedBrand.name,
        api: selectedBrand.api,
        baseUrl: baseUrl.trim() || selectedBrand.baseUrl,
        apiKey: apiKey.trim(),
        models: [model, ...selectedBrand.defaultModels.filter((m) => m !== model)],
        enabled: true,
      };

      const result = await kernelLlmConfig.addProvider(provider);
      if (!result.success) {
        // If already exists, just update active
        if (result.error?.includes('already exists') && editProvider) {
          setError(result.error);
        } else {
          setError(result.error || '保存失败');
        }
        return;
      }

      // Auto-set as active (first provider or explicitly chosen)
      const setActiveResult = await kernelLlmConfig.setActive(provider.id, model);
      if (!setActiveResult.success) {
        setError(setActiveResult.error || '设置为默认失败');
        return;
      }

      // Try to hot-update running kernel
      await kernelLlmConfig.updateProviderConfig().catch(() => {});

      onSaved();
      handleClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setStep('brand');
    setSelectedBrand(null);
    setCustomName('');
    setBaseUrl('');
    setApiKey('');
    setShowKey(false);
    setSelectedModel('');
    setCustomModel('');
    setTestResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editProvider ? '编辑服务商' : '添加 AI 服务商'}</SheetTitle>
          <SheetDescription>
            {step === 'brand'
              ? '选择一个 AI 服务商品牌'
              : `配置 ${selectedBrand?.name || ''} 的连接信息`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                step === 'brand' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              1
            </span>
            <span className={step === 'brand' ? 'font-medium' : 'text-muted-foreground'}>选择品牌</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                step === 'config' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              2
            </span>
            <span className={step === 'config' ? 'font-medium' : 'text-muted-foreground'}>输入配置</span>
          </div>

          {step === 'brand' ? (
            /* Step 1: Brand Selection */
            <div className="space-y-6">
              {categories.map((cat) => (
                <div key={cat.key}>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    {cat.icon}
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BUILT_IN_PROVIDERS.filter((p) => p.category === cat.key).map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => selectBrand(brand)}
                        className={cn(
                          'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                          'hover:border-primary/50 hover:bg-accent',
                          selectedBrand?.id === brand.id && 'border-primary bg-accent',
                        )}
                      >
                        <span className="text-sm font-medium">{brand.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {brand.api === 'anthropic' ? 'Anthropic API' : 'OpenAI API'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Step 2: Configuration */
            selectedBrand && (
              <div className="space-y-5">
                {/* Brand badge */}
                <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
                  <span className="text-sm font-medium">{selectedBrand.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({selectedBrand.api === 'anthropic' ? 'Anthropic' : 'OpenAI'} API)
                  </span>
                </div>

                {/* Custom Name */}
                <div className="space-y-2">
                  <Label>显示名称</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={selectedBrand.name}
                  />
                </div>

                {/* Base URL */}
                <div className="space-y-2">
                  <Label>API 地址 (Base URL)</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={selectedBrand.baseUrl}
                  />
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>API Key</Label>
                    {selectedBrand.keyUrl && (
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(selectedBrand.keyUrl, '_blank');
                        }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        获取 Key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="sk-..."
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                  <Label>模型</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedBrand.defaultModels.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          setSelectedModel(model);
                          setCustomModel('');
                        }}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs transition-all',
                          selectedModel === model && !customModel
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:border-primary/50',
                        )}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Input
                      value={customModel}
                      onChange={(e) => {
                        setCustomModel(e.target.value);
                        if (e.target.value) setSelectedModel('');
                      }}
                      placeholder="或输入自定义模型名..."
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Test Connection */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testConnection}
                    disabled={!apiKey.trim() || testing}
                  >
                    {testing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                    测试连接
                  </Button>
                  {testResult && (
                    <span
                      className={cn(
                        'text-xs',
                        testResult.success ? 'text-green-600' : 'text-destructive',
                      )}
                    >
                      {testResult.success ? (
                        <>
                          <Check className="mr-1 inline h-3 w-3" />
                          连接成功 ({testResult.latency}ms)
                        </>
                      ) : (
                        testResult.error
                      )}
                    </span>
                  )}
                </div>

                {/* Error */}
                {error && <p className="text-xs text-destructive">{error}</p>}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep('brand')}>
                    上一步
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={save}
                    disabled={!apiKey.trim() || !getEffectiveModel() || saving}
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    保存并启用
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
