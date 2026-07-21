import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

describe('Hermes server phase 2 Batch D', () => {
  it('removes Koa config.ts and db/index.ts', () => {
    expect(existsSync('server/src/config.ts')).toBe(false);
    expect(existsSync('server/src/db/index.ts')).toBe(false);
  });

  it('removes HERMES_* env aliases from electron/main/index.ts', () => {
    const mainSrc = readFileSync('electron/main/index.ts', 'utf-8');
    expect(mainSrc).not.toContain('HERMES_WEB_UI_HOME');
    expect(mainSrc).not.toContain('HERMES_DATA_DIR');
    expect(mainSrc).not.toContain('HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN');
  });

  it('has no live readers of the three HERMES_* env vars', () => {
    const vars = [
      'HERMES_WEB_UI_HOME',
      'HERMES_DATA_DIR',
      'HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN',
    ];
    for (const v of vars) {
      const grep = `grep -RIn "${v}" server/src electron scripts --include='*.ts' --include='*.js' || true`;
      const hits = execSync(grep, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      const disallowed = hits
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          // Docs and harness specs may mention the variable for historical context.
          if (line.startsWith('docs/')) return false;
          if (line.startsWith('harness/')) return false;
          if (line.startsWith('tests/unit/hermes-server-batch-')) return false;
          return true;
        });
      expect(disallowed).toEqual([]);
    }
  });

  it('does not delete protected shared infrastructure', () => {
    // License server
    expect(existsSync('server/src/index.ts')).toBe(true);
    expect(existsSync('server/src/handlers')).toBe(true);
    expect(existsSync('server/src/middleware')).toBe(true);
    expect(existsSync('server/src/utils')).toBe(true);
    expect(existsSync('server/src/types.ts')).toBe(true);
    // Electron main process
    expect(existsSync('electron/main/index.ts')).toBe(true);
  });
});
