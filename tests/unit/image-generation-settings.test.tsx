import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { ImageGenerationSettings } from '../../src/components/settings/ImageGenerationSettings';

const fetchSettingsMock = vi.fn();
const saveSettingsMock = vi.fn();
const runTestMock = vi.fn();

vi.mock('@/lib/image-generation', () => ({
  fetchImageGenerationSettings: (...args: unknown[]) => fetchSettingsMock(...args),
  saveImageGenerationSettings: (...args: unknown[]) => saveSettingsMock(...args),
  runImageGenerationTest: (...args: unknown[]) => runTestMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

const tMock = vi.fn((key: string, opts?: Record<string, unknown>) => {
  if (opts && typeof opts === 'object') {
    return `${key}:${JSON.stringify(opts)}`;
  }
  return key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tMock }),
}));

const UNCONFIGURED_SNAPSHOT = {
  success: true,
  config: { primary: null, fallbacks: [], timeoutMs: null },
  autoProviderFallback: true,
  defaultAgentId: 'default',
  agents: [
    { id: 'default', name: 'Default', isDefault: true, provider: null, configured: false },
  ],
  openAiRelay: {
    enabled: false,
    baseUrl: '',
    model: '',
    providerKey: 'clawx-openai-image',
    apiKeyConfigured: false,
  },
};

const CONFIGURED_SNAPSHOT = {
  success: true,
  config: { primary: 'clawx-openai-image/gpt-image-2', fallbacks: [], timeoutMs: 180000 },
  autoProviderFallback: false,
  defaultAgentId: 'default',
  agents: [
    { id: 'default', name: 'Default', isDefault: true, provider: 'clawx-openai-image', configured: true },
  ],
  openAiRelay: {
    enabled: true,
    baseUrl: 'https://taolat.com/v1',
    model: 'gpt-image-2',
    providerKey: 'clawx-openai-image',
    apiKeyConfigured: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue(UNCONFIGURED_SNAPSHOT);
});

describe('ImageGenerationSettings', () => {
  it('loads and renders the relay form with base url / model / api key fields', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });
    expect(screen.getByTestId('image-generation-openai-relay')).toBeInTheDocument();
    expect(screen.getByTestId('image-generation-relay-base-url')).toHaveValue('https://taolat.com/v1');
    expect(screen.getByTestId('image-generation-relay-model')).toHaveValue('gpt-image-2');
    // api key is password-typed and blank (existing key configured => blank to keep)
    expect(screen.getByTestId('image-generation-relay-api-key')).toHaveValue('');
    expect((screen.getByTestId('image-generation-relay-api-key') as HTMLInputElement).type).toBe('password');
    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('shows configured API key status when apiKeyConfigured is true', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('image-generation-api-key-status')).toBeInTheDocument();
    });
    expect(screen.getByTestId('image-generation-api-key-status')).not.toBeEmptyDOMElement();
  });

  it('shows missing API key status when not configured', async () => {
    render(<ImageGenerationSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('image-generation-api-key-status')).toBeInTheDocument();
    });
    expect(tMock).toHaveBeenCalledWith('settings:aiProviders.dialog.apiKeyMissing');
  });

  it('save button stays disabled until dirty and then calls saveImageGenerationSettings', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    const saveButton = screen.getByTestId('image-generation-save') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    // make it dirty by changing the api key
    fireEvent.change(screen.getByTestId('image-generation-relay-api-key'), {
      target: { value: 'sk-new-image-key' },
    });
    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    saveSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledTimes(1);
    });
    expect(saveSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openAiRelayEnabled: true,
        openAiRelayBaseUrl: 'https://taolat.com/v1',
        openAiRelayModel: 'gpt-image-2',
        openAiRelayApiKey: 'sk-new-image-key',
        timeoutMs: 180000,
      }),
    );
  });

  it('rejects a model ref containing a slash', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('image-generation-relay-model'), {
      target: { value: 'clawx-openai-image/gpt-image-2' },
    });
    fireEvent.change(screen.getByTestId('image-generation-relay-api-key'), {
      target: { value: 'sk-new-image-key' },
    });

    const saveButton = screen.getByTestId('image-generation-save') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(tMock).toHaveBeenCalledWith('imageGeneration.errors.relayModelInvalid');
    });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('runs a test via runImageGenerationTest after save state is clean', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    runTestMock.mockResolvedValue({ success: true, durationMs: 1234, command: 'cmd', agentId: 'default' });

    const testButton = screen.getByTestId('image-generation-test-button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(testButton);
    });

    await waitFor(() => {
      expect(runTestMock).toHaveBeenCalledTimes(1);
    });
    expect(runTestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 180000,
      }),
    );
  });

  it('toasts an error when fetchImageGenerationSettings rejects', async () => {
    fetchSettingsMock.mockRejectedValueOnce(new Error('network down'));
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('network down');
    });
  });

  it('rolls back saving state and toasts an error when saveImageGenerationSettings rejects', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    saveSettingsMock.mockRejectedValueOnce(new Error('save failed'));
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    const saveButton = screen.getByTestId('image-generation-save') as HTMLButtonElement;
    fireEvent.change(screen.getByTestId('image-generation-relay-api-key'), {
      target: { value: 'sk-new-image-key' },
    });
    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('save failed');
    });
    // saving flag rolled back to false after the failed attempt
    await waitFor(() => {
      expect(saveButton.textContent).not.toContain('imageGeneration.saving');
    });
    // button text returns to the idle save label (translated key present)
    expect(tMock).toHaveBeenCalledWith('imageGeneration.save');
  });

  it('toasts an error when runImageGenerationTest returns a failed result', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    runTestMock.mockResolvedValue({
      success: false,
      durationMs: 100,
      command: 'cmd',
      agentId: 'default',
      error: 'provider returned 500',
    });

    const testButton = screen.getByTestId('image-generation-test-button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(testButton);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('provider returned 500');
    });
  });

  it('shows saveBeforeTest toast and skips runTest when dirty', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    // make the form dirty
    fireEvent.change(screen.getByTestId('image-generation-relay-api-key'), {
      target: { value: 'sk-new-image-key' },
    });

    const testButton = screen.getByTestId('image-generation-test-button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(testButton);
    });

    await waitFor(() => {
      expect(tMock).toHaveBeenCalledWith('imageGeneration.toast.saveBeforeTest');
    });
    expect(runTestMock).not.toHaveBeenCalled();
  });

  it('returns to a non-dirty state after typing and clearing the api key', async () => {
    fetchSettingsMock.mockResolvedValue(CONFIGURED_SNAPSHOT);
    render(<ImageGenerationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('image-generation-settings-title')).toBeInTheDocument();
    });

    const saveButton = screen.getByTestId('image-generation-save') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const apiKeyInput = screen.getByTestId('image-generation-relay-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-temp' } });
    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    fireEvent.change(apiKeyInput, { target: { value: '' } });
    await waitFor(() => {
      expect(saveButton.disabled).toBe(true);
    });
  });
});
