import { Feature, MemberEvent } from './types';
import { memberEventBus } from './event-bus';

/** Store key for usage counter buckets */
const USAGE_COUNTER_KEY = 'usageCounter';

/** Default bucket shape when none exists or JSON is corrupted */
interface UsageBucket {
  [feature: string]: number;
}

/** Lazy-load electron-store (ESM module) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let usageStoreInstance: any = null;

async function getUsageStore() {
  if (!usageStoreInstance) {
    const Store = (await import('electron-store')).default;
    usageStoreInstance = new Store<{ [key: string]: string }>({
      name: 'clawdock-usage',
      defaults: {},
    });
  }
  return usageStoreInstance;
}

export interface TokenSnapshot {
  used: number;
}

export class UsageCounter {
  private _bucket: UsageBucket = {};
  private _currentMonth = '';
  private _initialized = false;
  private _syncHandler = () => this.syncToServer();

  /** Initialize counter: restore from store, create bucket, bind online event */
  async init(): Promise<void> {
    if (this._initialized) return;

    this._currentMonth = this.getCurrentYearMonth();
    const store = await getUsageStore();
    const raw = store.get(this._currentMonth) as string | undefined;

    this._bucket = this.getBucket(raw);
    this._initialized = true;

    memberEventBus.on(MemberEvent.NETWORK_ONLINE, this._syncHandler);
  }

  /** Get local count for a feature in the current month */
  getCount(feature: Feature): number {
    return this._bucket[feature] ?? 0;
  }

  /** Increment local count for a feature */
  increment(feature: Feature): void {
    this._bucket[feature] = (this._bucket[feature] ?? 0) + 1;
    this.saveBucket(this._bucket);
  }

  /**
   * Check whether the offline budget is respected.
   * 1. localCount <= offlineBudget
   * 2. (tokenSnapshot.used + localCount) <= (tokenSnapshot.used + offlineBudget)
   */
  checkOfflineBudget(
    feature: Feature,
    tokenSnapshot: TokenSnapshot,
    offlineBudget: number,
  ): boolean {
    const localCount = this.getCount(feature);
    if (localCount > offlineBudget) return false;
    if (tokenSnapshot.used + localCount > tokenSnapshot.used + offlineBudget) return false;
    return true;
  }

  /** Sync local counts with server authoritative data */
  async syncToServer(): Promise<void> {
    try {
      const res = await fetch('/api/v1/usage/stats', { method: 'GET' });
      if (!res.ok) return;

      const data = (await res.json()) as { usage?: Record<Feature, { used: number }> };
      if (!data.usage) return;

      // Recalibrate: for each feature, local count = max(0, local - serverUsedDelta)
      // Simplified: just reset local counts since server is authoritative
      for (const feature of Object.keys(data.usage) as Feature[]) {
        const serverUsed = data.usage[feature]?.used ?? 0;
        const localCount = this._bucket[feature] ?? 0;
        // If server already counted some usages we tracked locally, subtract them
        this._bucket[feature] = Math.max(0, localCount - serverUsed);
      }

      this.saveBucket(this._bucket);
    } catch {
      // Silently ignore sync errors; next online event will retry
    }
  }

  /** Reset all counts — intended for testing only */
  resetForTesting(): void {
    this._bucket = {};
    this._currentMonth = this.getCurrentYearMonth();
    this.saveBucket(this._bucket);
  }

  /** Read current bucket; if raw JSON is corrupted, reset to default */
  private getBucket(raw: string | undefined): UsageBucket {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as UsageBucket;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch {
      return {};
    }
  }

  /** Persist current bucket to store */
  private saveBucket(bucket: UsageBucket): void {
    // Fire-and-forget async save; errors are silently ignored
    getUsageStore()
      .then((store) => store.set(this._currentMonth, JSON.stringify(bucket)))
      .catch(() => {
        // ignore persistence errors
      });
  }

  /** Return "YYYY-MM" for the current UTC date */
  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}

/** Singleton instance */
export const usageCounter = new UsageCounter();
