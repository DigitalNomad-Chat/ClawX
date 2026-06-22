import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hostApiFetch } from '@/lib/host-api';
import { loadSessionTranscriptFallback } from '@/stores/chat/history-transcript-fallback';

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

describe('history-transcript-fallback', () => {
  beforeEach(() => {
    vi.mocked(hostApiFetch).mockReset();
  });

  it('returns messages from the transcript endpoint', async () => {
    vi.mocked(hostApiFetch).mockResolvedValue({
      messages: [{ role: 'assistant', content: 'full text' }],
    });

    const result = await loadSessionTranscriptFallback('agent:main:main', 200);

    expect(hostApiFetch).toHaveBeenCalledWith(
      '/api/sessions/transcript?sessionKey=agent%3Amain%3Amain&limit=200',
    );
    expect(result).toEqual([{ role: 'assistant', content: 'full text' }]);
  });

  it('returns an empty array when response messages is missing', async () => {
    vi.mocked(hostApiFetch).mockResolvedValue({});

    const result = await loadSessionTranscriptFallback('agent:main:main', 200);

    expect(result).toEqual([]);
  });

  it('returns an empty array and warns on fetch failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('network down');
    vi.mocked(hostApiFetch).mockRejectedValue(error);

    const result = await loadSessionTranscriptFallback('agent:main:main', 200);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[chat.history] transcript fallback failed:',
      error,
    );
    warnSpy.mockRestore();
  });
});
