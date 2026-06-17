import { describe, expect, it } from 'vitest';
import {
  buildConfiguredModelOptions,
  formatModelRefLabel,
  resolveRuntimeProviderKey,
} from '../../src/lib/model-options';
import type { ProviderAccount, ProviderWithKeyInfo } from '../../src/lib/providers';

const now = '2026-04-28T00:00:00.000Z';

function account(overrides: Partial<ProviderAccount>): ProviderAccount {
  return {
    id: 'custom-alpha1234',
    vendorId: 'custom',
    label: 'Alpha',
    authMode: 'api_key',
    model: 'model-alpha',
    enabled: true,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ProviderAccount;
}

function status(id: string, hasKey = true): ProviderWithKeyInfo {
  return {
    id,
    type: 'custom',
    name: id,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    hasKey,
    keyMasked: hasKey ? 'sk-***' : null,
  } as ProviderWithKeyInfo;
}

describe('model option helpers', () => {
  it('formats model refs using only the text after the provider prefix', () => {
    expect(formatModelRefLabel('openrouter/openai/gpt-5.4')).toBe('openai/gpt-5.4');
    expect(formatModelRefLabel('custom-alpha1234/model-alpha')).toBe('model-alpha');
  });

  describe('resolveRuntimeProviderKey', () => {
    it('returns semantic custom provider ids without hashing', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'agnes-ai' }))).toBe('agnes-ai');
      expect(resolveRuntimeProviderKey(account({ id: 'my-api' }))).toBe('my-api');
      expect(resolveRuntimeProviderKey(account({ id: 'localhost', vendorId: 'ollama' }))).toBe('localhost');
    });

    it('hashes UUID custom/ollama provider ids', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'abc12345-1234-1234-1234-123456789012' }))).toBe('custom-abc12345');
      expect(
        resolveRuntimeProviderKey(account({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', vendorId: 'ollama' })),
      ).toBe('ollama-a1b2c3d4');
    });

    it('returns already-hashed custom/ollama runtime keys as-is', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'custom-agnesai' }))).toBe('custom-agnesai');
      expect(resolveRuntimeProviderKey(account({ id: 'ollama-local01', vendorId: 'ollama' }))).toBe('ollama-local01');
    });

    it('maps built-in provider aliases to OpenClaw keys', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'kimi-coding', vendorId: 'kimi-coding' }))).toBe('kimi');
      expect(resolveRuntimeProviderKey(account({ id: 'qwen-coding-cn', vendorId: 'qwen-coding-cn' }))).toBe('qwen');
      expect(resolveRuntimeProviderKey(account({ id: 'qwen-standard-global', vendorId: 'qwen-standard-global' }))).toBe('qwen');
      expect(resolveRuntimeProviderKey(account({ id: 'qwen-standard-cn', vendorId: 'qwen-standard-cn' }))).toBe('qwen');
      expect(resolveRuntimeProviderKey(account({ id: 'modelstudio', vendorId: 'modelstudio' }))).toBe('qwen');
      expect(resolveRuntimeProviderKey(account({ id: 'minimax-portal-cn', vendorId: 'minimax-portal-cn' }))).toBe('minimax-portal');
    });

    it('maps OAuth browser providers to their runtime keys', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'google-account', vendorId: 'google', authMode: 'oauth_browser' }))).toBe('google-gemini-cli');
      expect(resolveRuntimeProviderKey(account({ id: 'openai-account', vendorId: 'openai', authMode: 'oauth_browser' }))).toBe('openai-codex');
    });

    it('returns vendorId directly for standard providers', () => {
      expect(resolveRuntimeProviderKey(account({ id: 'openai', vendorId: 'openai' }))).toBe('openai');
      expect(resolveRuntimeProviderKey(account({ id: 'anthropic', vendorId: 'anthropic' }))).toBe('anthropic');
      expect(resolveRuntimeProviderKey(account({ id: 'moonshot-global', vendorId: 'moonshot-global' }))).toBe('moonshot-global');
    });
  });

  it('builds one configured custom model option per UUID-based account', () => {
    const options = buildConfiguredModelOptions(
      [
        account({ id: 'abc12345-1234-1234-1234-123456789012', model: 'model-alpha', updatedAt: '2026-04-03T00:00:00.000Z' }),
        account({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', label: 'Beta', model: 'model-beta', updatedAt: '2026-04-02T00:00:00.000Z' }),
      ],
      [status('abc12345-1234-1234-1234-123456789012'), status('a1b2c3d4-e5f6-7890-abcd-ef1234567890')],
      'abc12345-1234-1234-1234-123456789012',
    );

    expect(options).toEqual([
      {
        modelRef: 'custom-abc12345/model-alpha',
        label: 'model-alpha',
        runtimeProviderKey: 'custom-abc12345',
        accountId: 'abc12345-1234-1234-1234-123456789012',
      },
      {
        modelRef: 'custom-a1b2c3d4/model-beta',
        label: 'model-beta',
        runtimeProviderKey: 'custom-a1b2c3d4',
        accountId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      },
    ]);
  });

  it('preserves semantic custom provider ids in configured model options', () => {
    const options = buildConfiguredModelOptions(
      [account({ id: 'agnes-ai', label: 'Agnes AI', model: 'agnes-2.0-flash' })],
      [status('agnes-ai')],
      'agnes-ai',
    );

    expect(options).toEqual([
      {
        modelRef: 'agnes-ai/agnes-2.0-flash',
        label: 'agnes-2.0-flash',
        runtimeProviderKey: 'agnes-ai',
        accountId: 'agnes-ai',
      },
    ]);
  });

  it('strips foreign provider prefix from account model when building ref', () => {
    const options = buildConfiguredModelOptions(
      [account({ id: 'agnes-ai', label: 'Agnes AI', model: 'custom-agnesai/agnes-2.0-flash' })],
      [status('agnes-ai')],
      'agnes-ai',
    );

    expect(options).toEqual([
      {
        modelRef: 'agnes-ai/agnes-2.0-flash',
        label: 'agnes-2.0-flash',
        runtimeProviderKey: 'agnes-ai',
        accountId: 'agnes-ai',
      },
    ]);
  });

  it('keeps prefixed account models intact and skips accounts without credentials', () => {
    const runtimeKey = resolveRuntimeProviderKey(account({ id: 'abc12345-1234-1234-1234-123456789012' }));
    const options = buildConfiguredModelOptions(
      [
        account({ id: 'abc12345-1234-1234-1234-123456789012', model: `${runtimeKey}/model-gamma` }),
        account({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', label: 'Delta', model: 'model-delta' }),
      ],
      [status('abc12345-1234-1234-1234-123456789012'), status('a1b2c3d4-e5f6-7890-abcd-ef1234567890', false)],
      null,
    );

    expect(options).toHaveLength(1);
    expect(options[0].modelRef).toBe('custom-abc12345/model-gamma');
    expect(options[0].label).toBe('model-gamma');
  });

  it('treats malformed provider snapshots as empty options', () => {
    expect(
      buildConfiguredModelOptions(
        {} as ProviderAccount[],
        {} as ProviderWithKeyInfo[],
        null,
      ),
    ).toEqual([]);
  });
});
