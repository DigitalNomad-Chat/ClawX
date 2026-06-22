import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatHistoryRpcParams,
  DEFAULT_CHAT_HISTORY_MAX_CHARS,
  getChatHistoryMaxChars,
  OPENCLAW_CHAT_HISTORY_MAX_CHARS_CAP,
  resetChatHistoryMaxCharsCache,
  resolveChatHistoryMaxChars,
} from '@/stores/chat/history-rpc-params';

describe('history-rpc-params', () => {
  beforeEach(() => {
    resetChatHistoryMaxCharsCache();
  });

  describe('getChatHistoryMaxChars', () => {
    it('returns the default cap when cache is empty and no rpc is provided', () => {
      expect(getChatHistoryMaxChars()).toBe(OPENCLAW_CHAT_HISTORY_MAX_CHARS_CAP);
    });

    it('returns the default cap synchronously and schedules a config.get refresh', async () => {
      const rpc = vi.fn().mockResolvedValue({
        config: { gateway: { webchat: { chatHistoryMaxChars: 100_000 } } },
      });

      const value = getChatHistoryMaxChars(rpc);

      expect(value).toBe(DEFAULT_CHAT_HISTORY_MAX_CHARS);
      await vi.waitFor(() =>
        expect(rpc).toHaveBeenCalledWith('config.get', {}, 5_000),
      );
      expect(getChatHistoryMaxChars()).toBe(100_000);
    });

    it('caches the value after first call and skips further rpc calls', () => {
      const value = getChatHistoryMaxChars();
      expect(getChatHistoryMaxChars()).toBe(value);
    });

    it.each([
      ['config.gateway.webchat', { config: { gateway: { webchat: { chatHistoryMaxChars: 123 } } } }, 123],
      ['parsed.gateway.webchat', { parsed: { gateway: { webchat: { chatHistoryMaxChars: 123 } } } }, 123],
      ['root.gateway.webchat', { gateway: { webchat: { chatHistoryMaxChars: 123 } } }, 123],
    ])('reads %s config path', async (_name, snapshot, expected) => {
      const rpc = vi.fn().mockResolvedValue(snapshot);
      getChatHistoryMaxChars(rpc);
      await vi.waitFor(() => expect(getChatHistoryMaxChars()).toBe(expected));
    });

    it('clamps values below 1 to 1', async () => {
      const rpc = vi.fn().mockResolvedValue({
        config: { gateway: { webchat: { chatHistoryMaxChars: 0 } } },
      });
      getChatHistoryMaxChars(rpc);
      await vi.waitFor(() => expect(getChatHistoryMaxChars()).toBe(1));
    });

    it('clamps values above cap to cap', async () => {
      const rpc = vi.fn().mockResolvedValue({
        config: { gateway: { webchat: { chatHistoryMaxChars: 1_000_000 } } },
      });
      getChatHistoryMaxChars(rpc);
      await vi.waitFor(() =>
        expect(getChatHistoryMaxChars()).toBe(OPENCLAW_CHAT_HISTORY_MAX_CHARS_CAP),
      );
    });

    it('keeps the default cap when config.get fails', async () => {
      const rpc = vi.fn().mockRejectedValue(new Error('unavailable'));
      getChatHistoryMaxChars(rpc);
      await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
      expect(getChatHistoryMaxChars()).toBe(DEFAULT_CHAT_HISTORY_MAX_CHARS);
    });
  });

  describe('resolveChatHistoryMaxChars', () => {
    it('returns the default cap', async () => {
      const value = await resolveChatHistoryMaxChars();
      expect(value).toBe(DEFAULT_CHAT_HISTORY_MAX_CHARS);
    });
  });

  describe('buildChatHistoryRpcParams', () => {
    it('builds params with sessionKey, limit, and maxChars', () => {
      expect(buildChatHistoryRpcParams('agent:main:main', 200, 12_345)).toEqual({
        sessionKey: 'agent:main:main',
        limit: 200,
        maxChars: 12_345,
      });
    });
  });
});
