/**
 * Kernel LLM Config Store — Independent LLM configuration for the ClawX Kernel
 * Completely separate from OpenClaw's provider system.
 *
 * Storage: electron-store (name: 'clawx-kernel-llm')
 */
import { ipcMain } from 'electron';

// ─── Types ──────────────────────────────────────────────────────────────

export type KernelApiType = 'anthropic' | 'openai';

export interface KernelLLMProvider {
  id: string;
  name: string;
  api: KernelApiType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
}

export interface KernelLLMActiveConfig {
  providerId: string;
  model: string;
}

export interface KernelLLMConfig {
  version: number;
  providers: KernelLLMProvider[];
  active: KernelLLMActiveConfig;
}

export interface BuiltInProvider {
  id: string;
  name: string;
  api: KernelApiType;
  baseUrl: string;
  defaultModels: string[];
  keyUrl?: string;
  category: 'intl' | 'cn' | 'platform';
}

// ─── Built-in Provider Templates ────────────────────────────────────────

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModels: [
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-opus-4-6',
      'claude-opus-4-5',
      'claude-3-5-sonnet-latest',
      'claude-3-opus-latest',
      'claude-3-haiku-latest',
    ],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    category: 'intl',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
    ],
    keyUrl: 'https://platform.openai.com/api-keys',
    category: 'intl',
  },
  {
    id: 'openai-response',
    name: 'OpenAI Responses',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: [
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o1-mini',
      'o3-mini',
    ],
    keyUrl: 'https://platform.openai.com/api-keys',
    category: 'intl',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    api: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModels: ['glm-5', 'glm-4.7', 'glm-4', 'glm-3-turbo'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    category: 'cn',
  },
  {
    id: 'zhipu-coding',
    name: '智谱编程专用',
    api: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    defaultModels: ['glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    category: 'cn',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    category: 'cn',
  },
  {
    id: 'bailian-coding',
    name: '百炼编程',
    api: 'openai',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    defaultModels: [
      'qwen3.5-plus',
      'qwen3-max-2026-01-23',
      'qwen3-coder-plus',
      'MiniMax-M2.5',
      'glm-5',
      'glm-4.7',
      'kimi-k2.5',
    ],
    keyUrl: 'https://bailian.console.aliyun.com/#/api-key',
    category: 'platform',
  },
  {
    id: 'dashscope',
    name: '通义千问',
    api: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    category: 'platform',
  },
  {
    id: 'tencent-coding',
    name: '腾讯云编程',
    api: 'openai',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
    defaultModels: [
      'tc-code-latest',
      'hunyuan-2.0-instruct',
      'hunyuan-2.0-thinking',
      'hunyuan-t1',
      'hunyuan-turbos',
      'minimax-m2.5',
    ],
    keyUrl: 'https://console.cloud.tencent.com/lkeap',
    category: 'platform',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    api: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: ['deepseek-ai/DeepSeek-V3'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    category: 'platform',
  },
];

// ─── Store ──────────────────────────────────────────────────────────────

let llmStore: ReturnType<typeof createStore> | null = null;

async function createStore() {
  const Store = (await import('electron-store')).default;
  return new Store<{
    config: KernelLLMConfig;
  }>({
    name: 'clawx-kernel-llm',
    defaults: {
      config: {
        version: 1,
        providers: [],
        active: { providerId: '', model: '' },
      },
    },
  });
}

export async function getLLMStore() {
  if (!llmStore) {
    llmStore = await createStore();
  }
  return llmStore;
}

// ─── CRUD ───────────────────────────────────────────────────────────────

export async function readKernelLLMConfig(): Promise<KernelLLMConfig> {
  const store = await getLLMStore();
  return store.get('config');
}

export async function writeKernelLLMConfig(config: KernelLLMConfig): Promise<void> {
  const store = await getLLMStore();
  store.set('config', config);
}

/** Get the currently active provider's full info (used by kernel-launcher) */
export async function getActiveLLMProvider(): Promise<(KernelLLMProvider & { model: string }) | null> {
  const config = await readKernelLLMConfig();
  if (!config.active.providerId || !config.active.model) return null;

  const provider = config.providers.find((p) => p.id === config.active.providerId);
  if (!provider) return null;

  return { ...provider, model: config.active.model };
}

// ─── IPC Routes ─────────────────────────────────────────────────────────

export function registerKernelLLMRoutes(): void {
  // Read full config
  ipcMain.handle('kernel-llm:readConfig', async () => {
    try {
      const config = await readKernelLLMConfig();
      return { success: true, config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Add provider
  ipcMain.handle('kernel-llm:addProvider', async (_event, provider: KernelLLMProvider) => {
    try {
      const config = await readKernelLLMConfig();
      if (config.providers.some((p) => p.id === provider.id)) {
        return { success: false, error: `Provider '${provider.id}' already exists` };
      }
      config.providers.push(provider);

      // Auto-activate if this is the first provider
      if (config.providers.length === 1 && !config.active.providerId) {
        config.active = { providerId: provider.id, model: provider.models[0] || '' };
      }

      await writeKernelLLMConfig(config);
      return { success: true, config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Delete provider
  ipcMain.handle('kernel-llm:deleteProvider', async (_event, providerId: string) => {
    try {
      const config = await readKernelLLMConfig();
      config.providers = config.providers.filter((p) => p.id !== providerId);

      // Clear active if deleted
      if (config.active.providerId === providerId) {
        config.active = { providerId: '', model: '' };
      }

      await writeKernelLLMConfig(config);
      return { success: true, config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Set active provider + model
  ipcMain.handle(
    'kernel-llm:setActive',
    async (_event, providerId: string, model: string) => {
      try {
        const config = await readKernelLLMConfig();
        const provider = config.providers.find((p) => p.id === providerId);
        if (!provider) {
          return { success: false, error: `Provider '${providerId}' not found` };
        }
        if (!provider.models.includes(model)) {
          return { success: false, error: `Model '${model}' not in provider` };
        }
        config.active = { providerId, model };
        await writeKernelLLMConfig(config);
        return { success: true, config };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  // Check if active provider is configured
  ipcMain.handle('kernel-llm:checkActive', async () => {
    try {
      const active = await getActiveLLMProvider();
      if (!active) {
        return { success: false, error: '未配置AI模型', needsSetup: true };
      }
      return {
        success: true,
        providerId: active.id,
        providerName: active.name,
        model: active.model,
        api: active.api,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message, needsSetup: true };
    }
  });

  // Test API connection
  ipcMain.handle(
    'kernel-llm:testConnection',
    async (_event, api: KernelApiType, baseUrl: string, apiKey: string, model: string) => {
      try {
        const result = await testLLMConnection(api, baseUrl, apiKey, model);
        return result;
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  // Hot-update running kernel's provider config
  ipcMain.handle('kernel-llm:updateProviderConfig', async () => {
    const { getKernelLauncher } = await import('../index.js');
    const launcher = getKernelLauncher();
    if (!launcher || !launcher.isRunning()) {
      return { success: false, error: 'Kernel not running' };
    }

    const active = await getActiveLLMProvider();
    if (!active) return { success: false, error: 'No active provider' };

    await launcher.sendStream({
      type: 'kernel.updateConfig',
      apiKey: active.api === 'anthropic' ? active.apiKey : undefined,
      openaiApiKey: active.api === 'openai' ? active.apiKey : undefined,
      model: active.model,
      baseUrl: active.baseUrl,
    } as unknown as Record<string, unknown>);

    return { success: true };
  });

  // Discover providers from OpenClaw's provider store
  ipcMain.handle('kernel-llm:discoverOpenClaw', async () => {
    try {
      const providers = await discoverOpenClawProviders();
      // Strip full API keys before sending to renderer — only send masked versions
      const safe = providers.map((p) => ({
        id: p.id,
        name: p.name,
        api: p.api,
        baseUrl: p.baseUrl,
        hasApiKey: p.hasApiKey,
        maskedApiKey: p.maskedApiKey,
        models: p.models,
      }));
      return { success: true, providers: safe };
    } catch (err) {
      return { success: false, error: (err as Error).message, providers: [] };
    }
  });

  // Import selected OpenClaw providers into kernel LLM store
  ipcMain.handle(
    'kernel-llm:importFromOpenClaw',
    async (_event, providerIds: string[]) => {
      try {
        // Re-discover to get full API keys (only in main process)
        const allProviders = await discoverOpenClawProviders();
        const selected = allProviders.filter((p) => providerIds.includes(p.id));

        if (!selected.length) {
          return { success: false, error: '未选择任何服务商', imported: 0, skipped: 0 };
        }

        const result = await importFromOpenClaw(selected);

        // Hot-update running kernel with new config
        if (result.success && result.config) {
          const { getKernelLauncher } = await import('../index.js');
          const launcher = getKernelLauncher();
          if (launcher?.isRunning()) {
            const active = await getActiveLLMProvider();
            if (active) {
              await launcher.sendStream({
                type: 'kernel.updateConfig',
                apiKey: active.api === 'anthropic' ? active.apiKey : undefined,
                openaiApiKey: active.api === 'openai' ? active.apiKey : undefined,
                model: active.model,
                baseUrl: active.baseUrl,
              } as unknown as Record<string, unknown>);
            }
          }
        }

        // Strip full keys from response
        return {
          success: result.success,
          config: result.config,
          imported: result.imported,
          skipped: result.skipped,
          error: result.error,
        };
      } catch (err) {
        return { success: false, error: (err as Error).message, imported: 0, skipped: 0 };
      }
    },
  );

  console.log('[KernelLLM] Routes registered');
}

// ─── Connection Test ────────────────────────────────────────────────────

async function testLLMConnection(
  api: KernelApiType,
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ success: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  const url = baseUrl.replace(/\/$/, '');

  if (api === 'anthropic') {
    const res = await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const latency = Date.now() - start;
    if (res.ok) return { success: true, latency };
    const body = await res.text().catch(() => '');
    return { success: false, latency, error: `${res.status} ${res.statusText}: ${body.slice(0, 200)}` };
  }

  // openai
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });
  const latency = Date.now() - start;
  if (res.ok) return { success: true, latency };
  const body = await res.text().catch(() => '');
  return { success: false, latency, error: `${res.status} ${res.statusText}: ${body.slice(0, 200)}` };
}

// ─── Import from OpenClaw ────────────────────────────────────────────────

export interface OpenClawProviderSummary {
  /** vendorId from ProviderAccount (e.g. 'anthropic', 'deepseek') */
  id: string;
  /** Display name (from ProviderAccount.label or vendorId) */
  name: string;
  /** Mapped API type for the kernel */
  api: KernelApiType;
  /** Base URL for API calls */
  baseUrl: string;
  /** Whether the account has a usable API key */
  hasApiKey: boolean;
  /** Masked API key for preview (e.g. "sk-ant-3****") — empty if no key */
  maskedApiKey: string;
  /** The full API key — only used during import, never sent to renderer directly */
  _fullApiKey: string;
  /** Available model IDs */
  models: string[];
}

/**
 * Vendor ID to display name mapping
 */
const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google AI',
  openrouter: 'OpenRouter',
  ark: '火山引擎',
  moonshot: 'Moonshot',
  siliconflow: 'SiliconFlow',
  'minimax-portal': 'MiniMax',
  'minimax-portal-cn': 'MiniMax (国内)',
  modelstudio: '百炼',
  ollama: 'Ollama',
  custom: '自定义',
};

/**
 * Map OpenClaw vendorId to kernel API type.
 * Only 'anthropic' uses Anthropic API; everything else goes through OpenAI-compatible.
 */
function vendorIdToApiType(vendorId: string): KernelApiType {
  return vendorId === 'anthropic' ? 'anthropic' : 'openai';
}

/**
 * Mask an API key for safe display.
 * Returns first 8 chars + "****" if key is long enough; otherwise "****".
 */
function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 8) + '****';
}

/**
 * Discover providers from OpenClaw's provider store.
 * Returns a list of summaries suitable for import.
 *
 * Filters:
 * - Only enabled accounts
 * - Only api_key / local auth modes (OAuth is not supported by the kernel)
 * - Only accounts with a non-empty API key
 */
export async function discoverOpenClawProviders(): Promise<OpenClawProviderSummary[]> {
  const { getClawXProviderStore } = await import('../../services/providers/store-instance.js');
  const { getProviderSecret } = await import('../../services/secrets/secret-store.js');

  const store = await getClawXProviderStore();
  const accounts = (store.get('providerAccounts') ?? {}) as Record<string, import('../../shared/providers/types.js').ProviderAccount>;

  const summaries: OpenClawProviderSummary[] = [];

  for (const [accountId, account] of Object.entries(accounts)) {
    // Filter: only enabled accounts
    if (!account.enabled) continue;

    // Filter: only api_key or local auth (kernel doesn't support OAuth)
    if (account.authMode !== 'api_key' && account.authMode !== 'local') continue;

    // Get API key
    const secret = await getProviderSecret(accountId);
    let apiKey = '';
    if (secret?.type === 'api_key') {
      apiKey = secret.apiKey;
    } else if (secret?.type === 'local') {
      apiKey = secret.apiKey || '';
    }

    // Collect models
    const models: string[] = [];
    if (account.model) models.push(account.model);
    if (account.fallbackModels?.length) {
      for (const m of account.fallbackModels) {
        if (!models.includes(m)) models.push(m);
      }
    }
    if (account.metadata?.customModels?.length) {
      for (const m of account.metadata.customModels) {
        if (!models.includes(m)) models.push(m);
      }
    }

    // Derive base URL
    const baseUrl = account.baseUrl || '';

    summaries.push({
      id: accountId,
      name: account.label || VENDOR_DISPLAY_NAMES[account.vendorId] || account.vendorId,
      api: vendorIdToApiType(account.vendorId),
      baseUrl,
      hasApiKey: !!apiKey,
      maskedApiKey: maskApiKey(apiKey),
      _fullApiKey: apiKey,
      models,
    });
  }

  return summaries;
}

/**
 * Import selected OpenClaw providers into the kernel LLM store.
 * Handles deduplication: overwrites existing providers with the same id.
 *
 * Returns the updated config and import stats.
 */
export async function importFromOpenClaw(
  selected: OpenClawProviderSummary[],
): Promise<{
  success: boolean;
  config?: KernelLLMConfig;
  imported: number;
  skipped: number;
  error?: string;
}> {
  if (!selected.length) {
    return { success: false, imported: 0, skipped: 0, error: 'No providers selected' };
  }

  const config = await readKernelLLMConfig();
  let imported = 0;
  let skipped = 0;
  let firstImportedId = '';
  let firstImportedModel = '';

  for (const provider of selected) {
    // Skip providers without API key
    if (!provider._fullApiKey) {
      skipped++;
      continue;
    }

    // Use vendor-based id: derive a stable kernel id from OpenClaw account id
    // This allows overwriting if the same account is imported again
    const existingIdx = config.providers.findIndex((p) => p.id === provider.id);

    const kernelProvider: KernelLLMProvider = {
      id: provider.id,
      name: provider.name,
      api: provider.api,
      baseUrl: provider.baseUrl,
      apiKey: provider._fullApiKey,
      models: provider.models.length > 0 ? provider.models : ['default'],
      enabled: true,
    };

    if (existingIdx >= 0) {
      // Overwrite existing
      config.providers[existingIdx] = kernelProvider;
    } else {
      config.providers.push(kernelProvider);
    }

    if (!firstImportedId) {
      firstImportedId = kernelProvider.id;
      firstImportedModel = kernelProvider.models[0] || '';
    }
    imported++;
  }

  // Auto-activate first imported provider if no active provider set
  if (firstImportedId && (!config.active.providerId || !config.providers.find((p) => p.id === config.active.providerId))) {
    config.active = { providerId: firstImportedId, model: firstImportedModel };
  }

  await writeKernelLLMConfig(config);

  return { success: true, config, imported, skipped };
}
