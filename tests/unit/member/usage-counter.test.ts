import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsageCounter, TokenSnapshot } from '@electron/services/member/usage-counter';
import { memberEventBus } from '@electron/services/member/event-bus';
import { MemberEvent, Feature } from '@electron/services/member/types';

// Mock electron-store
const mockStoreData: Record<string, string> = {};
const mockStore = {
  get: vi.fn((key: string) => mockStoreData[key]),
  set: vi.fn((key: string, value: string) => {
    mockStoreData[key] = value;
  }),
};

vi.mock('electron-store', () => ({
  default: function MockStore() {
    return mockStore;
  },
}));

describe('UsageCounter', () => {
  let counter: UsageCounter;
  const feature: Feature = 'collaboration';

  beforeEach(() => {
    vi.resetAllMocks();
    Object.keys(mockStoreData).forEach((k) => delete mockStoreData[k]);
    global.fetch = vi.fn();
    counter = new UsageCounter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初始计数为 0', async () => {
    await counter.init();
    expect(counter.getCount(feature)).toBe(0);
  });

  it('递增计数', async () => {
    await counter.init();
    counter.increment(feature);
    expect(counter.getCount(feature)).toBe(1);
    counter.increment(feature);
    expect(counter.getCount(feature)).toBe(2);
  });

  it('离线预算通过检查', async () => {
    await counter.init();
    counter.increment(feature);
    const tokenSnapshot: TokenSnapshot = { used: 5 };
    expect(counter.checkOfflineBudget(feature, tokenSnapshot, 10)).toBe(true);
  });

  it('离线预算拒绝（localCount 超限）', async () => {
    await counter.init();
    // Manually set local count beyond budget
    for (let i = 0; i < 6; i++) {
      counter.increment(feature);
    }
    const tokenSnapshot: TokenSnapshot = { used: 5 };
    expect(counter.checkOfflineBudget(feature, tokenSnapshot, 5)).toBe(false);
  });

  it('月度重置/清除', async () => {
    await counter.init();
    counter.increment(feature);
    expect(counter.getCount(feature)).toBe(1);

    counter.resetForTesting();
    expect(counter.getCount(feature)).toBe(0);
  });

  it('JSON 损坏自动重置', async () => {
    // Pre-seed corrupted JSON for current month
    const ym = (() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    })();
    mockStoreData[ym] = 'not-json{';

    const c = new UsageCounter();
    await c.init();
    expect(c.getCount(feature)).toBe(0);
  });

  it('联网时触发 syncToServer 校准本地计数', async () => {
    await counter.init();
    counter.increment(feature);
    counter.increment(feature);
    expect(counter.getCount(feature)).toBe(2);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usage: {
          collaboration: { used: 1 },
        },
      }),
    });

    await counter.syncToServer();
    expect(counter.getCount(feature)).toBe(1); // 2 local - 1 server = 1
  });

  it('NETWORK_ONLINE 事件触发同步', async () => {
    const syncSpy = vi.spyOn(counter, 'syncToServer').mockResolvedValue(undefined);
    await counter.init();

    memberEventBus.emit(MemberEvent.NETWORK_ONLINE);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });
});
