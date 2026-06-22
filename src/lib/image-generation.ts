import { hostApiFetch } from '@/lib/host-api';

export interface ImageGenerationModelConfig {
  primary: string | null;
  fallbacks: string[];
  timeoutMs: number | null;
}

export interface ImageGenerationAgentAuthRow {
  id: string;
  name: string;
  isDefault: boolean;
  provider: string | null;
  configured: boolean;
}

export interface OpenAiImageRelayConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  providerKey?: string;
  apiKeyConfigured: boolean;
}

export interface ImageGenerationSettingsSnapshot {
  config: ImageGenerationModelConfig;
  autoProviderFallback: boolean;
  defaultAgentId: string;
  agents: ImageGenerationAgentAuthRow[];
  openAiRelay: OpenAiImageRelayConfig;
}

export interface ImageGenerationTestResult {
  success: boolean;
  agentId: string;
  command: string;
  durationMs: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

export async function fetchImageGenerationSettings(): Promise<ImageGenerationSettingsSnapshot> {
  const response = await hostApiFetch<{ success: boolean } & ImageGenerationSettingsSnapshot>(
    '/api/media/image-generation',
  );
  if (response.success === false) {
    throw new Error('Failed to load image generation settings');
  }
  return response;
}

export async function saveImageGenerationSettings(payload: {
  primary?: string | null;
  fallbacks?: string[];
  timeoutMs?: number | null;
  openAiRelayEnabled?: boolean;
  openAiRelayBaseUrl?: string | null;
  openAiRelayModel?: string | null;
  openAiRelayApiKey?: string;
}): Promise<ImageGenerationSettingsSnapshot> {
  const response = await hostApiFetch<{ success: boolean } & ImageGenerationSettingsSnapshot>(
    '/api/media/image-generation',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (response.success === false) {
    throw new Error('Failed to save image generation settings');
  }
  return response;
}

/**
 * Derive the client-side test timeout from the configured runtime `timeoutMs`.
 * The client must wait longer than the main-process runtime cap so that a slow
 * but successful generation is not prematurely reported as a timeout to the user.
 * Falls back to 90s (+ buffer) when no timeout is configured.
 */
function resolveClientTestTimeoutMs(timeoutMs?: number | null): number {
  const configured = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : 90_000;
  return Math.max(100_000, configured + 10_000);
}

export async function runImageGenerationTest(payload: {
  agentId?: string;
  prompt?: string;
  model?: string;
  /** Configured runtime timeout (ms). Client waits slightly longer than this. */
  timeoutMs?: number | null;
}): Promise<ImageGenerationTestResult> {
  const clientTimeoutMs = resolveClientTestTimeoutMs(payload.timeoutMs);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clientTimeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) => {
    // AbortController handles the actual cancellation; this race guard ensures
    // a clean rejection even on environments where the signal is ignored.
    setTimeout(
      () => reject(new Error('Image generation test timed out. Try again or lower the timeout in settings.')),
      clientTimeoutMs,
    );
  });

  try {
    return await Promise.race([
      hostApiFetch<ImageGenerationTestResult>('/api/media/image-generation/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
