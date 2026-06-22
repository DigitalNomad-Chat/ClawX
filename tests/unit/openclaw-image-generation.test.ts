import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { testHome, testUserData, getSettingMock, ensurePluginMock } = vi.hoisted(() => {
  const suffix = Math.random().toString(36).slice(2);
  return {
    testHome: `/tmp/clawdock-openclaw-image-gen-${suffix}`,
    testUserData: `/tmp/clawdock-openclaw-image-gen-user-data-${suffix}`,
    getSettingMock: vi.fn(),
    ensurePluginMock: vi.fn(),
  };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  const mocked = {
    ...actual,
    homedir: () => testHome,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => testUserData,
    getVersion: () => '0.0.0-test',
  },
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: getSettingMock,
}));

vi.mock('@electron/utils/plugin-install', () => ({
  ensureClawXOpenAiImagePluginInstalled: ensurePluginMock,
}));

vi.mock('@electron/utils/paths', async () => {
  const actual = await vi.importActual<typeof import('@electron/utils/paths')>('@electron/utils/paths');
  const resolvedDir = join(testHome, '.openclaw-test-openclaw');
  return {
    ...actual,
    getOpenClawResolvedDir: () => resolvedDir,
    getOpenClawDir: () => resolvedDir,
  };
});

async function writeOpenClawJson(config: unknown): Promise<void> {
  const openclawDir = join(testHome, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  await writeFile(join(openclawDir, 'openclaw.json'), JSON.stringify(config, null, 2), 'utf8');
}

async function readOpenClawJson(): Promise<Record<string, unknown>> {
  const content = await readFile(join(testHome, '.openclaw', 'openclaw.json'), 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

describe('openclaw-image-generation helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
    getSettingMock.mockReset();
    await rm(testHome, { recursive: true, force: true });
    await rm(testUserData, { recursive: true, force: true });
  });

  it('parses and validates provider/model refs', async () => {
    const {
      parseProviderFromModelRef,
      isValidImageModelRef,
    } = await import('@electron/utils/openclaw-image-generation');

    expect(parseProviderFromModelRef('openai/gpt-image-2')).toBe('openai');
    expect(parseProviderFromModelRef('clawx-openai-image/gpt-image-2')).toBe('clawx-openai-image');
    expect(parseProviderFromModelRef('invalid')).toBeNull();
    expect(isValidImageModelRef('google/gemini-3.1-flash-image-preview')).toBe(true);
    expect(isValidImageModelRef('no-slash')).toBe(false);
  });

  it('reads an empty config as a null primary', async () => {
    await writeOpenClawJson({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4o' },
        },
      },
    });

    const { readImageGenerationConfig } = await import('@electron/utils/openclaw-image-generation');

    expect(await readImageGenerationConfig()).toEqual({
      primary: null,
      fallbacks: [],
      timeoutMs: null,
    });
  });

  it('writes agents.defaults.imageGenerationModel and disables auto provider fallback', async () => {
    await writeOpenClawJson({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4o' },
        },
      },
    });

    const {
      readImageGenerationConfig,
      setImageGenerationConfig,
    } = await import('@electron/utils/openclaw-image-generation');

    await setImageGenerationConfig({
      primary: 'clawx-openai-image/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });

    const saved = await readOpenClawJson();
    const defaults = (saved.agents as Record<string, unknown>).defaults as Record<string, unknown>;
    expect(defaults.imageGenerationModel).toEqual({
      primary: 'clawx-openai-image/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });
    expect(defaults.mediaGenerationAutoProviderFallback).toBe(false);

    expect(await readImageGenerationConfig()).toEqual({
      primary: 'clawx-openai-image/gpt-image-2',
      fallbacks: ['google/gemini-3.1-flash-image-preview'],
      timeoutMs: 120_000,
    });
  });

  it('rejects a primary model ref without a provider slash', async () => {
    await writeOpenClawJson({ agents: { defaults: {} } });
    const { setImageGenerationConfig } = await import('@electron/utils/openclaw-image-generation');

    await expect(setImageGenerationConfig({
      primary: 'no-slash',
      fallbacks: [],
      timeoutMs: null,
    })).rejects.toThrow(/provider\/model/);
  });

  it('clears imageGenerationModel when primary and fallbacks are empty', async () => {
    await writeOpenClawJson({
      agents: {
        defaults: {
          imageGenerationModel: { primary: 'clawx-openai-image/gpt-image-2' },
          mediaGenerationAutoProviderFallback: false,
        },
      },
    });

    const { setImageGenerationConfig, readImageGenerationConfig } = await import('@electron/utils/openclaw-image-generation');

    await setImageGenerationConfig({ primary: null, fallbacks: [], timeoutMs: null });

    const saved = await readOpenClawJson();
    const defaults = (saved.agents as Record<string, unknown>).defaults as Record<string, unknown>;
    expect(defaults.imageGenerationModel).toBeUndefined();
    expect(await readImageGenerationConfig()).toEqual({ primary: null, fallbacks: [], timeoutMs: null });
  });
});

describe('applyImageGenerationSettings', () => {
  beforeEach(async () => {
    vi.resetModules();
    getSettingMock.mockReset();
    ensurePluginMock.mockReset();
    ensurePluginMock.mockReturnValue({ installed: true });
    await rm(testHome, { recursive: true, force: true });
    await rm(testUserData, { recursive: true, force: true });
  });

  it('enables the relay and writes the model primary in one atomic write', async () => {
    await writeOpenClawJson({
      agents: {
        list: [
          {
            id: 'main',
            name: 'Main',
            default: true,
            workspace: '~/.openclaw/workspace',
            agentDir: '~/.openclaw/agents/main/agent',
          },
        ],
      },
      models: { providers: {} },
    });

    const { applyImageGenerationSettings, readImageGenerationConfig } = await import(
      '@electron/utils/openclaw-image-generation'
    );

    await applyImageGenerationSettings({
      openAiRelay: {
        enabled: true,
        baseUrl: 'https://relay.example.com',
        apiKey: 'sk-relay',
        model: 'gpt-image-2',
      },
      modelRef: 'clawx-openai-image/gpt-image-2',
    });

    const saved = await readOpenClawJson();
    const providers = (saved.models as Record<string, unknown>).providers as Record<string, unknown>;
    const relay = providers['clawx-openai-image'] as Record<string, unknown>;
    // Relay provider upserted with the private-network request flag.
    expect(relay).toBeDefined();
    expect(relay.request).toEqual({ allowPrivateNetwork: true });
    expect(relay.baseUrl).toBe('https://relay.example.com/v1');
    // Plugin registration enabled.
    const plugins = saved.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    expect((entries['clawx-openai-image'] as Record<string, unknown>).enabled).toBe(true);
    // Model primary written.
    expect(await readImageGenerationConfig()).toMatchObject({
      primary: 'clawx-openai-image/gpt-image-2',
    });
    // API key saved to auth profiles.
    const auth = JSON.parse(
      await readFile(join(testHome, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'), 'utf8'),
    ) as Record<string, Record<string, unknown>>;
    expect((auth.profiles['clawx-openai-image:default'] as Record<string, unknown>).key).toBe('sk-relay');
    // Plugin installer invoked for the enable path.
    expect(ensurePluginMock).toHaveBeenCalled();
  });

  it('disables the relay, clears the stored key, and clears the model primary', async () => {
    await writeOpenClawJson({
      agents: {
        list: [
          {
            id: 'main',
            name: 'Main',
            default: true,
            workspace: '~/.openclaw/workspace',
            agentDir: '~/.openclaw/agents/main/agent',
          },
        ],
        defaults: {
          imageGenerationModel: { primary: 'clawx-openai-image/gpt-image-2' },
        },
      },
      models: {
        providers: {
          'clawx-openai-image': { baseUrl: 'https://relay.example.com/v1', api: 'openai-completions', models: [] },
        },
      },
      plugins: {
        allow: ['clawx-openai-image'],
        entries: { 'clawx-openai-image': { enabled: true } },
      },
    });
    await mkdir(join(testHome, '.openclaw', 'agents', 'main', 'agent'), { recursive: true });
    await writeFile(
      join(testHome, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'),
      JSON.stringify({
        version: 1,
        profiles: {
          'clawx-openai-image:default': { type: 'api_key', provider: 'clawx-openai-image', key: 'sk-stale' },
        },
      }, null, 2),
      'utf8',
    );

    const { applyImageGenerationSettings, readImageGenerationConfig } = await import(
      '@electron/utils/openclaw-image-generation'
    );

    await applyImageGenerationSettings({
      openAiRelay: { enabled: false },
      modelRef: null,
    });

    const saved = await readOpenClawJson();
    const providers = (saved.models as Record<string, unknown>).providers as Record<string, unknown>;
    // Relay provider removed.
    expect(providers['clawx-openai-image']).toBeUndefined();
    // Plugin registration removed.
    const plugins = (saved.plugins as Record<string, unknown> | undefined) ?? {};
    const entries = (plugins.entries as Record<string, unknown> | undefined) ?? {};
    expect(entries['clawx-openai-image']).toBeUndefined();
    // Model primary cleared.
    expect(await readImageGenerationConfig()).toEqual({ primary: null, fallbacks: [], timeoutMs: null });
    // Stored key removed.
    const auth = JSON.parse(
      await readFile(join(testHome, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'), 'utf8'),
    ) as Record<string, Record<string, unknown>>;
    expect(auth.profiles['clawx-openai-image:default']).toBeUndefined();
    // Plugin installer not invoked on the disable path.
    expect(ensurePluginMock).not.toHaveBeenCalled();
  });

  it('preserves an existing timeoutMs when none is provided', async () => {
    await writeOpenClawJson({
      agents: {
        list: [
          {
            id: 'main',
            name: 'Main',
            default: true,
            workspace: '~/.openclaw/workspace',
            agentDir: '~/.openclaw/agents/main/agent',
          },
        ],
        defaults: {
          imageGenerationModel: { primary: 'clawx-openai-image/gpt-image-2', timeoutMs: 180000 },
        },
      },
      models: { providers: {} },
    });

    const { applyImageGenerationSettings, readImageGenerationConfig } = await import(
      '@electron/utils/openclaw-image-generation'
    );

    await applyImageGenerationSettings({
      modelRef: 'clawx-openai-image/gpt-image-2',
    });

    expect(await readImageGenerationConfig()).toMatchObject({ timeoutMs: 180000 });
  });
});
