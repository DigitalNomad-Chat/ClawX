import {
  OPENAI_CODEX_RUNTIME_PROVIDER_KEY,
  filterActiveProviderKeysForUi,
  getOpenClawProviderKeyForType,
  isOpenClawOAuthPluginProviderKey,
  resolveOpenClawProviderKey,
} from '@electron/utils/provider-keys';

describe('provider-keys', () => {
  it('maps OpenAI browser OAuth accounts to the openai-codex runtime key', () => {
    expect(resolveOpenClawProviderKey({
      vendorId: 'openai',
      id: 'openai-personal',
      authMode: 'oauth_browser',
    })).toBe(OPENAI_CODEX_RUNTIME_PROVIDER_KEY);

    expect(resolveOpenClawProviderKey({
      vendorId: 'openai',
      id: 'openai-personal',
      authMode: 'api_key',
    })).toBe('openai');
  });

  it('keeps custom multi-instance hashing behavior for UUID ids', () => {
    expect(getOpenClawProviderKeyForType('custom', '550e8400-e29b-41d4-a716-446655440000')).toBe('custom-550e8400');
  });

  it('preserves explicit non-UUID custom provider keys', () => {
    expect(getOpenClawProviderKeyForType('custom', 'my-local')).toBe('my-local');
  });

  it('treats openai-codex as an OAuth plugin provider key', () => {
    expect(isOpenClawOAuthPluginProviderKey('openai-codex')).toBe(true);
  });

  it('drops bare openai from the UI list when only openai-codex OAuth is active', () => {
    expect(filterActiveProviderKeysForUi(['openai', 'openai-codex', 'anthropic'])).toEqual([
      'openai-codex',
      'anthropic',
    ]);
  });

  it('keeps openai in the UI list when an API key is configured alongside Codex OAuth', () => {
    expect(filterActiveProviderKeysForUi(['openai', 'openai-codex'], {
      hasConfiguredOpenAiApiKey: true,
    })).toEqual(['openai', 'openai-codex']);
  });
});
