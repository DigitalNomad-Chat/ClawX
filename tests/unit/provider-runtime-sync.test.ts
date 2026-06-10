import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayManager } from '@electron/gateway/manager';
import type { ProviderConfig } from '@electron/utils/secure-storage';

const mocks = vi.hoisted(() => ({
  getProviderAccount: vi.fn(),
  listProviderAccounts: vi.fn(),
  getProviderSecret: vi.fn(),
  getAllProviders: vi.fn(),
  getApiKey: vi.fn(),
  getDefaultProvider: vi.fn(),
  getProvider: vi.fn(),
  getProviderConfig: vi.fn(),
  getProviderDefaultModel: vi.fn(),
  removeProviderFromOpenClaw: vi.fn(),
  removeProviderKeyFromOpenClaw: vi.fn(),
  saveOAuthTokenToOpenClaw: vi.fn(),
  saveProviderKeyToOpenClaw: vi.fn(),
  setOpenClawDefaultModel: vi.fn(),
  setOpenClawDefaultModelWithOverride: vi.fn(),
  syncProviderConfigToOpenClaw: vi.fn(),
  updateAgentModelProvider: vi.fn(),
  updateSingleAgentModelProvider: vi.fn(),
  listAgentsSnapshot: vi.fn(),
  getOpenClawProvidersConfig: vi.fn(),
}));

vi.mock('@electron/services/providers/provider-store', () => ({
  getProviderAccount: mocks.getProviderAccount,
  listProviderAccounts: mocks.listProviderAccounts,
}));

vi.mock('@electron/services/secrets/secret-store', () => ({
  getProviderSecret: mocks.getProviderSecret,
}));

vi.mock('@electron/utils/secure-storage', () => ({
  getAllProviders: mocks.getAllProviders,
  getApiKey: mocks.getApiKey,
  getDefaultProvider: mocks.getDefaultProvider,
  getProvider: mocks.getProvider,
}));

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderConfig: mocks.getProviderConfig,
  getProviderDefaultModel: mocks.getProviderDefaultModel,
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  removeProviderFromOpenClaw: mocks.removeProviderFromOpenClaw,
  removeProviderKeyFromOpenClaw: mocks.removeProviderKeyFromOpenClaw,
  saveOAuthTokenToOpenClaw: mocks.saveOAuthTokenToOpenClaw,
  saveProviderKeyToOpenClaw: mocks.saveProviderKeyToOpenClaw,
  setOpenClawDefaultModel: mocks.setOpenClawDefaultModel,
  setOpenClawDefaultModelWithOverride: mocks.setOpenClawDefaultModelWithOverride,
  syncProviderConfigToOpenClaw: mocks.syncProviderConfigToOpenClaw,
  updateAgentModelProvider: mocks.updateAgentModelProvider,
  updateSingleAgentModelProvider: mocks.updateSingleAgentModelProvider,
  getOpenClawProvidersConfig: mocks.getOpenClawProvidersConfig,
}));

vi.mock('@electron/utils/agent-config', () => ({
  listAgentsSnapshot: mocks.listAgentsSnapshot,
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  syncAgentModelOverrideToRuntime,
  syncDefaultProviderToRuntime,
  syncDeletedProviderApiKeyToRuntime,
  syncDeletedProviderToRuntime,
  syncSavedProviderToRuntime,
  syncUpdatedProviderToRuntime,
  getOpenClawProviderKey,
  getProviderModelRef,
} from '@electron/services/providers/provider-runtime-sync';

function createProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'moonshot',
    name: 'Moonshot',
    type: 'moonshot',
    model: 'kimi-k2.6',
    enabled: true,
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z',
    ...overrides,
  };
}

function createGateway(state: 'running' | 'stopped' = 'running'): Pick<GatewayManager, 'debouncedReload' | 'debouncedRestart' | 'getStatus'> {
  return {
    debouncedReload: vi.fn(),
    debouncedRestart: vi.fn(),
    getStatus: vi.fn(() => ({ state } as ReturnType<GatewayManager['getStatus']>)),
  };
}

describe('provider-runtime-sync refresh strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderAccount.mockResolvedValue(null);
    mocks.getProviderSecret.mockResolvedValue(undefined);
    mocks.getAllProviders.mockResolvedValue([]);
    mocks.getApiKey.mockResolvedValue('sk-test');
    mocks.getDefaultProvider.mockResolvedValue('moonshot');
    mocks.getProvider.mockResolvedValue(createProvider());
    mocks.getProviderDefaultModel.mockReturnValue('kimi-k2.6');
    mocks.getProviderConfig.mockReturnValue({
      api: 'openai-completions',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKeyEnv: 'MOONSHOT_API_KEY',
    });
    mocks.syncProviderConfigToOpenClaw.mockResolvedValue(undefined);
    mocks.setOpenClawDefaultModel.mockResolvedValue(undefined);
    mocks.setOpenClawDefaultModelWithOverride.mockResolvedValue(undefined);
    mocks.saveProviderKeyToOpenClaw.mockResolvedValue(undefined);
    mocks.removeProviderFromOpenClaw.mockResolvedValue(undefined);
    mocks.removeProviderKeyFromOpenClaw.mockResolvedValue(undefined);
    mocks.updateAgentModelProvider.mockResolvedValue(undefined);
    mocks.updateSingleAgentModelProvider.mockResolvedValue(undefined);
    mocks.listAgentsSnapshot.mockResolvedValue({ agents: [] });
    mocks.getOpenClawProvidersConfig.mockResolvedValue({ providers: {}, defaultModel: undefined, agentsList: [] });
  });

  it('uses debouncedReload after saving provider config', async () => {
    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(createProvider(), undefined, gateway as GatewayManager);

    expect(gateway.debouncedReload).toHaveBeenCalledTimes(1);
    expect(gateway.debouncedRestart).not.toHaveBeenCalled();
  });

  it('uses debouncedRestart after deleting provider config', async () => {
    const gateway = createGateway('running');
    await syncDeletedProviderToRuntime(createProvider(), 'moonshot', gateway as GatewayManager);

    expect(gateway.debouncedRestart).toHaveBeenCalledTimes(1);
    expect(gateway.debouncedReload).not.toHaveBeenCalled();
  });

  it('removes both runtime and stored account keys when deleting a custom provider', async () => {
    const gateway = createGateway('running');
    const customProvider = createProvider({
      id: 'moonshot-cn',
      type: 'custom',
      baseUrl: 'https://api.moonshot.cn/v1',
    });

    await syncDeletedProviderToRuntime(customProvider, 'moonshot-cn', gateway as GatewayManager);

    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('moonshot-cn');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledTimes(1);
    expect(gateway.debouncedRestart).toHaveBeenCalledTimes(1);
  });

  it('only clears the api-key profile when deleting a provider api key', async () => {
    const openaiProvider = createProvider({
      id: 'openai-personal',
      type: 'openai',
    });

    await syncDeletedProviderApiKeyToRuntime(openaiProvider, 'openai-personal');

    expect(mocks.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('openai');
    expect(mocks.removeProviderFromOpenClaw).not.toHaveBeenCalled();
  });

  it('uses debouncedReload after switching default provider when gateway is running', async () => {
    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('moonshot', gateway as GatewayManager);

    expect(gateway.debouncedReload).toHaveBeenCalledTimes(1);
    expect(gateway.debouncedRestart).not.toHaveBeenCalled();
  });

  it('skips refresh after switching default provider when gateway is stopped', async () => {
    const gateway = createGateway('stopped');
    await syncDefaultProviderToRuntime('moonshot', gateway as GatewayManager);

    expect(gateway.debouncedReload).not.toHaveBeenCalled();
    expect(gateway.debouncedRestart).not.toHaveBeenCalled();
  });

  it('uses gpt-5.4 as the browser OAuth default model for OpenAI', async () => {
    mocks.getProvider.mockResolvedValue(
      createProvider({
        id: 'openai-personal',
        type: 'openai',
        model: undefined,
      }),
    );
    mocks.getProviderAccount.mockResolvedValue({ authMode: 'oauth_browser' });
    mocks.getProviderSecret.mockResolvedValue({
      type: 'oauth',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 123,
      email: 'user@example.com',
      subject: 'project-1',
    });

    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('openai-personal', gateway as GatewayManager);

    expect(mocks.setOpenClawDefaultModel).toHaveBeenCalledWith(
      'openai-codex',
      'openai-codex/gpt-5.4',
      expect.any(Array),
    );
  });

  it('syncs a targeted agent model override to runtime provider registry', async () => {
    mocks.getAllProviders.mockResolvedValue([
      createProvider({
        id: 'ark',
        type: 'ark',
        model: 'doubao-pro',
      }),
    ]);
    mocks.getProviderConfig.mockImplementation((providerType: string) => {
      if (providerType === 'ark') {
        return {
          api: 'openai-completions',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKeyEnv: 'ARK_API_KEY',
        };
      }
      return {
        api: 'openai-completions',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiKeyEnv: 'MOONSHOT_API_KEY',
      };
    });
    mocks.listAgentsSnapshot.mockResolvedValue({
      agents: [
        {
          id: 'coder',
          modelRef: 'ark/ark-code-latest',
        },
      ],
    });

    await syncAgentModelOverrideToRuntime('coder');

    expect(mocks.updateSingleAgentModelProvider).toHaveBeenCalledWith(
      'coder',
      'ark',
      expect.objectContaining({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        api: 'openai-completions',
        models: [{ id: 'ark-code-latest', name: 'ark-code-latest', cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      }),
    );
  });

  it('syncs Ollama provider config to runtime without adding model prefix', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getProviderSecret.mockResolvedValue({ type: 'local', apiKey: 'ollama-local' });

    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(ollamaProvider, undefined, gateway as GatewayManager);

    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'ollamafd',
      'qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
    );
    expect(gateway.debouncedReload).toHaveBeenCalledTimes(1);
  });

  it('syncs Ollama as default provider with correct baseUrl and api protocol', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProvider.mockResolvedValue(ollamaProvider);
    mocks.getDefaultProvider.mockResolvedValue('ollamafd');
    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getApiKey.mockResolvedValue('ollama-local');

    const gateway = createGateway('running');
    await syncDefaultProviderToRuntime('ollamafd', gateway as GatewayManager);

    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith(
      'ollamafd',
      'ollamafd/qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
      expect.any(Array),
    );
  });
  it('syncs updated Ollama provider as default with correct override config', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.getProviderSecret.mockResolvedValue({ type: 'local', apiKey: 'ollama-local' });
    mocks.getDefaultProvider.mockResolvedValue('ollamafd');

    const gateway = createGateway('running');
    await syncUpdatedProviderToRuntime(ollamaProvider, undefined, gateway as GatewayManager);

    // Should use the custom/ollama branch with explicit override
    expect(mocks.setOpenClawDefaultModelWithOverride).toHaveBeenCalledWith(
      'ollamafd',
      'ollamafd/qwen3:30b',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      }),
      expect.any(Array),
    );
    // Should NOT call the non-override path
    expect(mocks.setOpenClawDefaultModel).not.toHaveBeenCalled();
    expect(gateway.debouncedReload).toHaveBeenCalledTimes(1);
  });

  it('removes Ollama provider from runtime on delete', async () => {
    const ollamaProvider = createProvider({
      id: 'ollamafd',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:30b',
      baseUrl: 'http://localhost:11434/v1',
    });

    const gateway = createGateway('running');
    await syncDeletedProviderToRuntime(ollamaProvider, 'ollamafd', gateway as GatewayManager);

    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledWith('ollamafd');
    expect(mocks.removeProviderFromOpenClaw).toHaveBeenCalledTimes(1);
    expect(gateway.debouncedRestart).toHaveBeenCalledTimes(1);
  });
});

describe('getOpenClawProviderKey', () => {
  it('returns providerId directly for non-UUID custom ids', () => {
    expect(getOpenClawProviderKey('custom', 'agnes-ai')).toBe('agnes-ai');
    expect(getOpenClawProviderKey('custom', 'my-api')).toBe('my-api');
    expect(getOpenClawProviderKey('ollama', 'localhost')).toBe('localhost');
  });

  it('returns hashed key for UUID custom ids', () => {
    expect(getOpenClawProviderKey('custom', 'abc12345-1234-1234-1234-123456789012')).toBe('custom-abc12345');
    expect(getOpenClawProviderKey('ollama', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('ollama-a1b2c3d4');
  });

  it('returns already-hashed keys as-is', () => {
    expect(getOpenClawProviderKey('custom', 'custom-agnesai')).toBe('custom-agnesai');
    expect(getOpenClawProviderKey('ollama', 'ollama-local01')).toBe('ollama-local01');
  });

  it('maps built-in types correctly', () => {
    expect(getOpenClawProviderKey('moonshot', 'any')).toBe('moonshot');
    expect(getOpenClawProviderKey('kimi-coding', 'any')).toBe('kimi');
    expect(getOpenClawProviderKey('minimax-portal-cn', 'any')).toBe('minimax-portal');
  });
});

describe('getProviderModelRef with semantic custom providers', () => {
  it('builds correct model ref for semantic custom provider id', () => {
    const config = createProvider({
      id: 'agnes-ai',
      type: 'custom',
      model: 'agnes-2.0-flash',
    });
    expect(getProviderModelRef(config)).toBe('agnes-ai/agnes-2.0-flash');
  });

  it('handles model that already contains provider prefix', () => {
    const config = createProvider({
      id: 'agnes-ai',
      type: 'custom',
      model: 'agnes-ai/agnes-2.0-flash',
    });
    // Should NOT produce double prefix like agnes-ai/agnes-ai/agnes-2.0-flash
    expect(getProviderModelRef(config)).toBe('agnes-ai/agnes-2.0-flash');
  });

  it('handles model seeded from openclaw.json with foreign provider prefix', () => {
    // Simulates the case where openclaw.json has model "old-vendor/some-model"
    // but provider id is now "new-vendor"
    const config = createProvider({
      id: 'new-vendor',
      type: 'custom',
      model: 'old-vendor/some-model',
    });
    expect(getProviderModelRef(config)).toBe('new-vendor/some-model');
  });
});

describe('syncSavedProviderToRuntime with semantic custom provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderAccount.mockResolvedValue(null);
    mocks.getProviderSecret.mockResolvedValue(undefined);
    mocks.getProviderConfig.mockReturnValue(undefined);
    mocks.syncProviderConfigToOpenClaw.mockResolvedValue(undefined);
    mocks.saveProviderKeyToOpenClaw.mockResolvedValue(undefined);
    mocks.updateAgentModelProvider.mockResolvedValue(undefined);
  });

  it('syncs semantic custom provider without hashing id', async () => {
    const semanticProvider = createProvider({
      id: 'agnes-ai',
      type: 'custom',
      name: 'Agnes AI',
      model: 'agnes-2.0-flash',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
    });

    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', apiKey: 'sk-agnes' });

    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(semanticProvider, undefined, gateway as GatewayManager);

    // Should use the semantic id directly, NOT custom-agnesai
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'agnes-ai',
      'agnes-2.0-flash',
      expect.objectContaining({
        baseUrl: 'https://apihub.agnes-ai.com/v1',
        api: 'openai-completions',
      }),
    );
    expect(mocks.saveProviderKeyToOpenClaw).toHaveBeenCalledWith('agnes-ai', 'sk-agnes');
    expect(gateway.debouncedReload).toHaveBeenCalledTimes(1);
  });

  it('extracts pure model id when model has foreign prefix', async () => {
    const semanticProvider = createProvider({
      id: 'agnes-ai',
      type: 'custom',
      name: 'Agnes AI',
      model: 'old-prefix/agnes-2.0-flash',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
    });

    mocks.getProviderSecret.mockResolvedValue({ type: 'api_key', apiKey: 'sk-agnes' });

    const gateway = createGateway('running');
    await syncSavedProviderToRuntime(semanticProvider, undefined, gateway as GatewayManager);

    // syncProviderConfigToOpenClaw should receive pure model id
    expect(mocks.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'agnes-ai',
      'old-prefix/agnes-2.0-flash',
      expect.any(Object),
    );

    // updateAgentModelProvider should receive stripped model id
    expect(mocks.updateAgentModelProvider).toHaveBeenCalledWith(
      'agnes-ai',
      expect.objectContaining({
        models: [{ id: 'agnes-2.0-flash', name: 'agnes-2.0-flash', cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      }),
    );
  });
});
