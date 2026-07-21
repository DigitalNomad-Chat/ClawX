import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('Hermes server phase 2 Batch C', () => {
  it('removes the 5 general Koa controllers', () => {
    const controllers = ['auth', 'health', 'update', 'upload', 'webhook'];
    for (const name of controllers) {
      expect(existsSync(`server/src/controllers/${name}.ts`)).toBe(false);
    }
  });

  it('removes the entire Hermes service tree', () => {
    expect(existsSync('server/src/services/hermes')).toBe(false);
  });

  it('removes general Koa services', () => {
    const services = [
      'app-config',
      'auth',
      'config-helpers',
      'credentials',
      'gateway-bootstrap',
      'logger',
      'login-limiter',
      'safe-file-store',
      'shutdown',
    ];
    for (const name of services) {
      expect(existsSync(`server/src/services/${name}.ts`)).toBe(false);
    }
  });

  it('removes the context-compressor library', () => {
    expect(existsSync('server/src/lib/context-compressor')).toBe(false);
  });

  it('has no live importers of deleted modules', () => {
    const patterns = [
      'controllers/auth',
      'controllers/health',
      'controllers/update',
      'controllers/upload',
      'controllers/webhook',
      'services/hermes/',
      'services/app-config',
      'services/auth',
      'services/config-helpers',
      'services/credentials',
      'services/gateway-bootstrap',
      'services/logger',
      'services/login-limiter',
      'services/safe-file-store',
      'services/shutdown',
      'lib/context-compressor',
    ];

    for (const pattern of patterns) {
      const grep = `grep -RIn "${pattern}" server/src electron src scripts --include='*.ts' --include='*.js' || true`;
      const hits = execSync(grep, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      const disallowed = hits
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          // Documentation and harness specs may still mention the deleted paths.
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
