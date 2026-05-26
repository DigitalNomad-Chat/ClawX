/**
 * UsageCounter (Local SQLite)
 * Tracks per-feature monthly usage in SQLite.
 * No remote sync — all counting is local.
 */
import { Feature } from './types';
import { getMemberDatabase } from './database';
import { logger } from '../../utils/logger';

export class UsageCounter {
  private _currentMonth = '';
  private _initialized = false;

  async init(): Promise<void> {
    if (this._initialized) return;
    this._currentMonth = this.getCurrentYearMonth();
    this._initialized = true;
  }

  /** Get local count for a feature in the current month */
  getCount(userId: string, feature: Feature): number {
    const db = getMemberDatabase();
    const row = db
      .prepare('SELECT used_count FROM feature_usage WHERE user_id = ? AND feature = ? AND year_month = ?')
      .get(userId, feature, this._currentMonth) as { used_count: number } | undefined;
    return row?.used_count ?? 0;
  }

  /** Increment local count for a feature. Returns new count. */
  increment(userId: string, feature: Feature): number {
    const db = getMemberDatabase();
    const month = this.getCurrentYearMonth();

    const result = db
      .prepare(
        `INSERT INTO feature_usage (user_id, feature, year_month, used_count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id, feature, year_month)
         DO UPDATE SET used_count = used_count + 1`,
      )
      .run(userId, feature, month);

    logger.debug(`[UsageCounter] Incremented ${feature} for ${userId}, changes: ${result.changes}`);
    return this.getCount(userId, feature);
  }

  /** Reset all counts for a user — intended for testing only */
  resetForTesting(userId: string): void {
    const db = getMemberDatabase();
    db.prepare('DELETE FROM feature_usage WHERE user_id = ?').run(userId);
  }

  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}

/** Singleton instance */
export const usageCounter = new UsageCounter();
