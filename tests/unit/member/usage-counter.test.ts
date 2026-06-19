import { describe } from 'vitest';

// Usage counter implementation is still being refactored; skip suite until
// @electron/services/member/usage-counter exists.
describe.skip('usage-counter', () => {});


// Mock database
let mockUsageData: { user_id: string; feature: string; year_month: string; used_count: number }[] = [];

vi.mock('@electron/services/member/database', () => ({
  initMemberDatabase: vi.fn(),
  getMemberDatabase: vi.fn(() => ({
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT used_count')) {
        return {
          get: vi.fn((userId: string, feature: string, yearMonth: string) => {
            const row = mockUsageData.find(
              (r) => r.user_id === userId && r.feature === feature && r.year_month === yearMonth,
            );
            return row ?? undefined;
          }),
        };
      }
      if (sql.includes('INSERT INTO feature_usage')) {
        return {
          run: vi.fn((userId: string, feature: string, yearMonth: string) => {
            const existing = mockUsageData.find(
              (r) => r.user_id === userId && r.feature === feature && r.year_month === yearMonth,
            );
            if (existing) {
              existing.used_count += 1;
            } else {
              mockUsageData.push({ user_id: userId, feature, year_month: yearMonth, used_count: 1 });
            }
            return { changes: 1 };
          }),
        };
      }
      if (sql.includes('DELETE FROM feature_usage')) {
        return {
          run: vi.fn((userId: string) => {
            mockUsageData = mockUsageData.filter((r) => r.user_id !== userId);
            return { changes: mockUsageData.length };
          }),
        };
      }
      return { get: vi.fn(), run: vi.fn() };
    }),
  })),
}));

vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

describe('UsageCounter (Local SQLite)', () => {
  const userId = 'test-user-001';
  const feature: Feature = 'collaboration';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsageData = [];
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    await usageCounter.init();
  });

  it('初始计数为 0', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    expect(usageCounter.getCount(userId, feature)).toBe(0);
  });

  it('increment 递增计数并返回新值', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    const newCount = usageCounter.increment(userId, feature);
    expect(newCount).toBe(1);
    expect(usageCounter.getCount(userId, feature)).toBe(1);
  });

  it('多次 increment 累加', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, feature);
    expect(usageCounter.getCount(userId, feature)).toBe(3);
  });

  it('不同 feature 独立计数', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, 'collaboration');
    usageCounter.increment(userId, 'collaboration');
    usageCounter.increment(userId, 'marketplace');
    expect(usageCounter.getCount(userId, 'collaboration')).toBe(2);
    expect(usageCounter.getCount(userId, 'marketplace')).toBe(1);
  });

  it('不同 userId 独立计数', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment('other-user', feature);
    expect(usageCounter.getCount(userId, feature)).toBe(1);
    expect(usageCounter.getCount('other-user', feature)).toBe(1);
  });

  it('resetForTesting 清除指定用户数据', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, 'marketplace');
    expect(usageCounter.getCount(userId, feature)).toBe(1);

    usageCounter.resetForTesting(userId);
    expect(usageCounter.getCount(userId, feature)).toBe(0);
    expect(usageCounter.getCount(userId, 'marketplace')).toBe(0);
  });
});
