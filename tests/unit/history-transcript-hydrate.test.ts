import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessionTranscriptFallback } from '@/stores/chat/history-transcript-fallback';
import { hydrateGatewayHistoryFromTranscript } from '@/stores/chat/history-transcript-hydrate';
import {
  gatewayHistoryNeedsTranscriptHydration,
  mergeGatewayHistoryWithTranscript,
} from '@/stores/chat/history-transcript-merge';
import type { RawMessage } from '@/stores/chat/types';

vi.mock('@/stores/chat/history-transcript-fallback', () => ({
  loadSessionTranscriptFallback: vi.fn(),
}));

vi.mock('@/stores/chat/history-transcript-merge', () => ({
  gatewayHistoryNeedsTranscriptHydration: vi.fn(),
  mergeGatewayHistoryWithTranscript: vi.fn(),
  isTruncatedHistoryText: vi.fn(),
}));

describe('history-transcript-hydrate', () => {
  const gatewayMessages: RawMessage[] = [
    { role: 'assistant', content: 'truncated..(truncated)..' },
  ];
  const transcriptMessages: RawMessage[] = [{ role: 'assistant', content: 'transcript full' }];
  const localMessages: RawMessage[] = [{ role: 'assistant', content: 'local full' }];

  beforeEach(() => {
    vi.mocked(gatewayHistoryNeedsTranscriptHydration).mockReset();
    vi.mocked(mergeGatewayHistoryWithTranscript).mockReset();
    vi.mocked(loadSessionTranscriptFallback).mockReset();
  });

  it('returns gateway messages when no truncation is detected', async () => {
    vi.mocked(gatewayHistoryNeedsTranscriptHydration).mockReturnValue(false);

    const result = await hydrateGatewayHistoryFromTranscript(
      'agent:main:main',
      gatewayMessages,
      200,
    );

    expect(result).toBe(gatewayMessages);
    expect(loadSessionTranscriptFallback).not.toHaveBeenCalled();
  });

  it('hydrates from transcript when messages are truncated', async () => {
    vi.mocked(gatewayHistoryNeedsTranscriptHydration)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    vi.mocked(loadSessionTranscriptFallback).mockResolvedValue(transcriptMessages);
    vi.mocked(mergeGatewayHistoryWithTranscript).mockReturnValue([
      { role: 'assistant', content: 'merged' },
    ]);

    const result = await hydrateGatewayHistoryFromTranscript(
      'agent:main:main',
      gatewayMessages,
      200,
    );

    expect(loadSessionTranscriptFallback).toHaveBeenCalledWith('agent:main:main', 200);
    expect(mergeGatewayHistoryWithTranscript).toHaveBeenCalledWith(
      gatewayMessages,
      transcriptMessages,
    );
    expect(result).toEqual([{ role: 'assistant', content: 'merged' }]);
  });

  it('falls back to local messages when transcript still leaves truncation', async () => {
    vi.mocked(gatewayHistoryNeedsTranscriptHydration)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    vi.mocked(loadSessionTranscriptFallback).mockResolvedValue(transcriptMessages);
    vi.mocked(mergeGatewayHistoryWithTranscript)
      .mockReturnValueOnce([{ role: 'assistant', content: 'still truncated..(truncated)..' }])
      .mockReturnValueOnce([{ role: 'assistant', content: 'local merged' }]);

    const result = await hydrateGatewayHistoryFromTranscript(
      'agent:main:main',
      gatewayMessages,
      200,
      localMessages,
    );

    expect(loadSessionTranscriptFallback).toHaveBeenCalledWith('agent:main:main', 200);
    expect(mergeGatewayHistoryWithTranscript).toHaveBeenNthCalledWith(
      1,
      gatewayMessages,
      transcriptMessages,
    );
    expect(mergeGatewayHistoryWithTranscript).toHaveBeenNthCalledWith(
      2,
      [{ role: 'assistant', content: 'still truncated..(truncated)..' }],
      localMessages,
    );
    expect(result).toEqual([{ role: 'assistant', content: 'local merged' }]);
  });

  it('does not use local messages when none are provided', async () => {
    vi.mocked(gatewayHistoryNeedsTranscriptHydration)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    vi.mocked(loadSessionTranscriptFallback).mockResolvedValue(transcriptMessages);
    vi.mocked(mergeGatewayHistoryWithTranscript).mockReturnValue([
      { role: 'assistant', content: 'still truncated..(truncated)..' },
    ]);

    const result = await hydrateGatewayHistoryFromTranscript(
      'agent:main:main',
      gatewayMessages,
      200,
    );

    expect(mergeGatewayHistoryWithTranscript).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ role: 'assistant', content: 'still truncated..(truncated)..' }]);
  });
});
