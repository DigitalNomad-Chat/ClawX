/**
 * Kernel LLM Config - Frontend types & IPC client for independent kernel LLM configuration
 * Matches backend types in electron/extensions/marketplace/kernel-llm-store.ts
 */

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

/** Summary of an OpenClaw provider discovered for import (API keys masked) */
export interface OpenClawProviderSummary {
  id: string;
  name: string;
  api: KernelApiType;
  baseUrl: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  models: string[];
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
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyUrl: 'https://platform.openai.com/api-keys',
    category: 'intl',
  },
  {
    id: 'openai-response',
    name: 'OpenAI Responses',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini'],
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

// ─── IPC Client ─────────────────────────────────────────────────────────

export const kernelLlmConfig = {
  /** Read full config */
  async readConfig(): Promise<{ success: boolean; config?: KernelLLMConfig; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:readConfig');
  },

  /** Add a provider */
  async addProvider(
    provider: KernelLLMProvider,
  ): Promise<{ success: boolean; config?: KernelLLMConfig; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:addProvider', provider);
  },

  /** Delete a provider */
  async deleteProvider(
    providerId: string,
  ): Promise<{ success: boolean; config?: KernelLLMConfig; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:deleteProvider', providerId);
  },

  /** Set active provider + model */
  async setActive(
    providerId: string,
    model: string,
  ): Promise<{ success: boolean; config?: KernelLLMConfig; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:setActive', providerId, model);
  },

  /** Check if active provider is configured */
  async checkActive(): Promise<{
    success: boolean;
    providerId?: string;
    providerName?: string;
    model?: string;
    api?: KernelApiType;
    error?: string;
    needsSetup?: boolean;
  }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:checkActive');
  },

  /** Test API connection */
  async testConnection(
    api: KernelApiType,
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<{ success: boolean; latency?: number; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:testConnection', api, baseUrl, apiKey, model);
  },

  /** Hot-update running kernel config */
  async updateProviderConfig(): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:updateProviderConfig');
  },

  // ─── Import from OpenClaw ────────────────────────────────────────────

  /** Discover providers from OpenClaw's provider store */
  async discoverOpenClaw(): Promise<{
    success: boolean;
    providers?: OpenClawProviderSummary[];
    error?: string;
  }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:discoverOpenClaw');
  },

  /** Import selected OpenClaw providers into kernel LLM store */
  async importFromOpenClaw(
    providerIds: string[],
  ): Promise<{
    success: boolean;
    config?: KernelLLMConfig;
    imported?: number;
    skipped?: number;
    error?: string;
  }> {
    return window.electron.ipcRenderer.invoke('kernel-llm:importFromOpenClaw', providerIds);
  },
};
