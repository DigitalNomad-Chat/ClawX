import { describe, expect, it } from 'vitest';
import { normalizeUsageHistoryEntries } from '@/lib/usage-history-entries';
import {
  filterUsageHistoryByWindow,
  groupUsageHistory,
  resolveVisibleUsageHistory,
} from '@/pages/Models/usage-history';

describe('normalizeUsageHistoryEntries', () => {
  it('passes through arrays', () => {
    const input = [{ model: 'a', totalTokens: 1 }];
    expect(normalizeUsageHistoryEntries(input)).toEqual(input);
  });

  it('unwraps common host/HTTP envelope keys', () => {
    expect(normalizeUsageHistoryEntries({ entries: [{ model: 'e' }] })).toEqual([{ model: 'e' }]);
    expect(normalizeUsageHistoryEntries({ items: [{ model: 'i' }] })).toEqual([{ model: 'i' }]);
    expect(normalizeUsageHistoryEntries({ data: [{ model: 'd' }] })).toEqual([{ model: 'd' }]);
    expect(normalizeUsageHistoryEntries({ history: [{ model: 'h' }] })).toEqual([{ model: 'h' }]);
  });

  it('returns empty array for scalars and non-list objects', () => {
    expect(normalizeUsageHistoryEntries(null)).toEqual([]);
    expect(normalizeUsageHistoryEntries(undefined)).toEqual([]);
    expect(normalizeUsageHistoryEntries('nope')).toEqual([]);
    expect(normalizeUsageHistoryEntries({ success: true })).toEqual([]);
    expect(normalizeUsageHistoryEntries(42)).toEqual([]);
  });
});

describe('usage-history helpers tolerate non-array input', () => {
  it('filterUsageHistoryByWindow does not throw on object payload', () => {
    expect(filterUsageHistoryByWindow({ entries: [] } as never, '7d')).toEqual([]);
    expect(filterUsageHistoryByWindow(null as never, 'all')).toEqual([]);
  });

  it('groupUsageHistory does not throw on object payload', () => {
    expect(groupUsageHistory({ items: [] } as never, 'model')).toEqual([]);
  });

  it('resolveVisibleUsageHistory does not throw on object payload', () => {
    expect(
      resolveVisibleUsageHistory({ data: [] } as never, { entries: [{ model: 's' }] } as never, {
        preferStableOnEmpty: true,
      }),
    ).toEqual([{ model: 's' }]);
  });
});
