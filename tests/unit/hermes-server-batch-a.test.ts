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

  it('removes Hermes routes except group-chat.ts (kept for Batch B)', () => {
    const hermesDir = resolve(repoRoot, 'server/src/routes/hermes');
    const files = existsSync(hermesDir)
      ? readdirSync(hermesDir, { withFileTypes: true })
          .filter((d) => d.isFile() && d.name.endsWith('.ts'))
          .map((d) => d.name)
          .sort()
      : [];
    expect(files).toEqual(['group-chat.ts']);
  });
});
