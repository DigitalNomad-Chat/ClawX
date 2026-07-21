import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('Hermes server phase 2 Batch B', () => {
  it('removes Hermes controllers', () => {
    expect(existsSync('server/src/controllers/hermes')).toBe(false);
  });

  it('removes Hermes DB layer', () => {
    expect(existsSync('server/src/db/hermes')).toBe(false);
  });

  it('removes the last Hermes route file (group-chat)', () => {
    expect(existsSync('server/src/routes/hermes/group-chat.ts')).toBe(false);
    // The hermes route directory is now empty and should be removed
    expect(existsSync('server/src/routes/hermes')).toBe(false);
  });

  it('has no importers of deleted controllers or db layer in server/src or electron', () => {
    const patterns = [
      'controllers/hermes',
      'db/hermes',
      'routes/hermes/group-chat',
    ];
    for (const pattern of patterns) {
      const grep = `grep -RIn "${pattern}" server/src electron || true`;
      const hits = execSync(grep, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      // Allowed residual references are only in dead Batch C files (services/hermes, lib/context-compressor)
      // and documentation. No live controllers/routes should remain.
      const disallowed = hits
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          // Batch C files and docs are expected to still reference db/hermes until Batch C
          if (line.includes('server/src/services/hermes/')) return false;
          if (line.includes('server/src/lib/context-compressor/')) return false;
          if (line.includes('docs/') || line.includes('harness/')) return false;
          return true;
        });
      expect(disallowed).toEqual([]);
    }
  });

  it('does not delete out-of-scope routes', () => {
    // server/src/routes/hermes should now be empty/removed; only group-chat was left after Batch A
    if (existsSync('server/src/routes/hermes')) {
      const remaining = readdirSync('server/src/routes/hermes');
      expect(remaining).toEqual([]);
    }
    // General Koa controllers/services, services/hermes, and context-compressor are Batch C scope
  });
});
