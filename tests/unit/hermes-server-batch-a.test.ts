import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

function fileExists(relative: string): boolean {
  return existsSync(resolve(repoRoot, relative));
}

describe('Hermes server phase 2 Batch A route removal', () => {
  it('removes the Koa route entry point', () => {
    expect(fileExists('server/src/routes/index.ts')).toBe(false);
  });

  it('removes all plain Koa routes', () => {
    const plain = ['health', 'auth', 'upload', 'update', 'webhook'];
    for (const name of plain) {
      expect(fileExists(`server/src/routes/${name}.ts`), `${name}.ts should be removed`).toBe(false);
    }
  });

  it('removes all Hermes routes (group-chat.ts removed in Batch B)', () => {
    expect(fileExists('server/src/routes/hermes/group-chat.ts')).toBe(false);
    // After Batch B the hermes route directory is empty and removed.
    expect(fileExists('server/src/routes/hermes')).toBe(false);
  });
});
