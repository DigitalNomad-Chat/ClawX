// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type PluginEntry = { npmName: string; pluginId: string };

type AfterPackModule = {
  __test?: {
    BUNDLED_PLUGINS?: PluginEntry[];
  };
};

describe('after-pack plugin list parity', () => {
  it('matches the bundle-openclaw-plugins manifest', async () => {
    const afterPack = require('../../scripts/after-pack.cjs') as AfterPackModule;
    const { PLUGINS } = (await import(
      '../../scripts/bundle-openclaw-plugins.mjs'
    )) as { PLUGINS: PluginEntry[] };

    const bundled = afterPack.__test?.BUNDLED_PLUGINS ?? [];

    const key = (p: PluginEntry) => `${p.pluginId}|${p.npmName}`;
    const normalize = (arr: PluginEntry[]) =>
      [...arr].sort((a, b) => key(a).localeCompare(key(b)));

    expect(normalize(bundled)).toEqual(normalize(PLUGINS));
  });
});
