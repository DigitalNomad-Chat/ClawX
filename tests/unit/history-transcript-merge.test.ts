import { describe, expect, it } from 'vitest';
import {
  gatewayHistoryNeedsTranscriptHydration,
  isTruncatedHistoryText,
  mergeGatewayHistoryWithTranscript,
} from '@/stores/chat/history-transcript-merge';
import type { RawMessage } from '@/stores/chat/types';

describe('history-transcript-merge', () => {
  describe('isTruncatedHistoryText', () => {
    it.each([
      ['ends with ..(truncated)..', 'some text..(truncated)..', true],
      ['ends with newline + suffix', 'some text\n..(truncated)..', true],
      ['ends with …(truncated)…', 'some text…(truncated)…', true],
      [
        'ends with omitted marker',
        'some text\n[chat.history omitted: message too large]',
        true,
      ],
      ['empty', '', false],
      ['no suffix', 'some text', false],
    ])('%s', (_name, text, expected) => {
      expect(isTruncatedHistoryText(text)).toBe(expected);
    });
  });

  describe('gatewayHistoryNeedsTranscriptHydration', () => {
    it('returns false for non-truncated messages', () => {
      const messages: RawMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      ];
      expect(gatewayHistoryNeedsTranscriptHydration(messages)).toBe(false);
    });

    it('returns true when any message text is truncated', () => {
      const messages: RawMessage[] = [
        { role: 'assistant', content: 'long text..(truncated)..' },
      ];
      expect(gatewayHistoryNeedsTranscriptHydration(messages)).toBe(true);
    });
  });

  describe('mergeGatewayHistoryWithTranscript', () => {
    it('returns empty when gateway messages are empty', () => {
      expect(mergeGatewayHistoryWithTranscript([], [])).toEqual([]);
    });

    it('returns gateway messages when transcript is empty', () => {
      const gateway: RawMessage[] = [{ role: 'assistant', content: 'hello' }];
      expect(mergeGatewayHistoryWithTranscript(gateway, [])).toEqual(gateway);
    });

    it('returns gateway messages when no truncation is detected', () => {
      const gateway: RawMessage[] = [{ role: 'assistant', content: 'hello' }];
      const transcript: RawMessage[] = [{ role: 'assistant', content: 'hello world' }];
      expect(mergeGatewayHistoryWithTranscript(gateway, transcript)).toEqual(gateway);
    });

    it('replaces truncated string content with full transcript', () => {
      const gateway: RawMessage[] = [
        { role: 'assistant', content: 'long prefix..(truncated)..' },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', content: 'long prefix and much more text' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe('long prefix and much more text');
    });

    it('does not replace when transcript is also truncated', () => {
      const gateway: RawMessage[] = [
        { role: 'assistant', content: 'long prefix..(truncated)..' },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', content: 'another prefix..(truncated)..' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe('long prefix..(truncated)..');
    });

    it('does not replace when transcript differs and gateway prefix is short', () => {
      const gateway: RawMessage[] = [
        { role: 'assistant', content: 'gw..(truncated)..' },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', content: 'totally different full text' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe('gw..(truncated)..');
    });

    it('replaces when gateway prefix is long enough even without exact start match', () => {
      const prefix = 'a'.repeat(64);
      const gateway: RawMessage[] = [
        { role: 'assistant', content: `${prefix}..(truncated)..` },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', content: `${prefix} and more text` },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe(`${prefix} and more text`);
    });

    it('replaces truncated content blocks while preserving non-text blocks', () => {
      const gateway: RawMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'long prefix..(truncated)..' },
            { type: 'image', url: '/api/chat/media/outgoing/1/full' },
          ],
        },
      ];
      const transcript: RawMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'long prefix and much more text' },
            { type: 'image', url: '/api/chat/media/outgoing/1/full' },
          ],
        },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      const content = merged[0].content as Array<{ type: string; text?: string; url?: string }>;
      expect(content[0].text).toBe('long prefix and much more text');
      expect(content[1]).toEqual({ type: 'image', url: '/api/chat/media/outgoing/1/full' });
    });

    it('replaces when content block counts differ and overall text matches', () => {
      const gateway: RawMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'long prefix..(truncated)..' }],
        },
      ];
      const transcript: RawMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'long prefix and much more text' },
            { type: 'text', text: 'extra block' },
          ],
        },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toEqual([
        { type: 'text', text: 'long prefix and much more text' },
        { type: 'text', text: 'extra block' },
      ]);
    });

    it('matches messages by id when available', () => {
      const gateway: RawMessage[] = [
        { role: 'assistant', id: 'msg-1', content: 'gateway..(truncated)..' },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', id: 'msg-1', content: 'gateway full text' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe('gateway full text');
    });

    it('falls back to index matching when ids differ', () => {
      const gateway: RawMessage[] = [
        { role: 'assistant', id: 'gw-1', content: 'a..(truncated)..' },
        { role: 'assistant', id: 'gw-2', content: 'b..(truncated)..' },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', id: 'tx-1', content: 'aaa full' },
        { role: 'assistant', id: 'tx-2', content: 'bbb full' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0].content).toBe('aaa full');
      expect(merged[1].content).toBe('bbb full');
    });

    it('preserves local-only metadata from gateway messages', () => {
      const gateway: RawMessage[] = [
        {
          role: 'assistant',
          id: 'msg-1',
          content: 'gateway..(truncated)..',
          _attachedFiles: [
            { fileName: 'x.png', mimeType: 'image/png', fileSize: 1, preview: null },
          ],
        },
      ];
      const transcript: RawMessage[] = [
        { role: 'assistant', id: 'msg-1', content: 'gateway full text' },
      ];
      const merged = mergeGatewayHistoryWithTranscript(gateway, transcript);
      expect(merged[0]._attachedFiles).toEqual(gateway[0]._attachedFiles);
    });
  });
});
