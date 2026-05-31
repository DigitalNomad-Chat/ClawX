/**
 * Local Cleanup Utility
 * One-time cleanup of legacy local SQLite member data after migration to cloud-first.
 */
import { app } from 'electron';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../utils/logger';

let _cleaned = false;

export async function cleanupLegacyLocalData(): Promise<boolean> {
  if (_cleaned) return false;

  try {
    const userData = app.getPath('userData');
    const memberDbPath = join(userData, 'member.db');

    if (existsSync(memberDbPath)) {
      // Backup old database
      const backupPath = join(userData, 'member.db.bak');
      renameSync(memberDbPath, backupPath);
      logger.info('[LocalCleanup] Legacy member.db moved to member.db.bak');
    }

    // Clear old electron-store auth keys if they exist in a different format
    try {
      const Store = (await import('electron-store')).default;
      const legacyStore = new Store({ name: 'member-auth' });
      legacyStore.clear();
    } catch {
      // Ignore if store doesn't exist
    }

    _cleaned = true;
    return true;
  } catch (err) {
    logger.warn('[LocalCleanup] Cleanup error:', err);
    return false;
  }
}
