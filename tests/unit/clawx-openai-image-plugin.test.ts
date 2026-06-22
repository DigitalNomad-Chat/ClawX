import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

/*
 * The upstream (#1098) variant of this test also dynamically imports the
 * plugin's index.mjs and exercises its `register` hook against a live HTTP
 * server. That requires the bundled `openclaw/plugin-sdk/*` subpaths to be
 * resolvable from the vitest working tree. In ClawDock, `openclaw` is packed
 * into build/openclaw by bundle-openclaw.mjs and is NOT present under the
 * top-level node_modules used by vitest, so the runtime import would throw
 * `ERR_MODULE_NOT_FOUND`. We keep the static assertions (which fully cover the
 * #1098 "no response_format" guarantee) and defer the end-to-end runtime
 * exercise to the manual smoke test in phase 6.4.
 */
describe('ClawX OpenAI image plugin request shape', () => {
  it('does not force deprecated OpenAI Images response_format', async () => {
    const pluginSource = await readFile(
      join(repoRoot, 'resources/openclaw-plugins/clawx-openai-image/index.mjs'),
      'utf8',
    );
    const packageJson = await readFile(join(repoRoot, 'package.json'), 'utf8');
    const bundleScript = await readFile(join(repoRoot, 'scripts/bundle-openclaw.mjs'), 'utf8');

    expect(pluginSource).not.toContain('response_format');
    expect(packageJson).not.toContain('patch-openclaw-image-b64-json');
    expect(bundleScript).not.toContain('response_format: "b64_json"');
  });

  it('exposes an OpenClaw plugin entry with the expected id and contracts', async () => {
    const manifest = JSON.parse(
      await readFile(join(repoRoot, 'resources/openclaw-plugins/clawx-openai-image/openclaw.plugin.json'), 'utf8'),
    ) as Record<string, unknown>;
    const pkg = JSON.parse(
      await readFile(join(repoRoot, 'resources/openclaw-plugins/clawx-openai-image/package.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(manifest.id).toBe('clawx-openai-image');
    expect(manifest.entry).toBe('index.mjs');
    expect(pkg.name).toBe('clawx-openai-image-plugin');
    expect(pkg.main).toBe('index.mjs');
    const contracts = manifest.contracts as { imageGenerationProviders?: string[] };
    expect(contracts.imageGenerationProviders).toEqual(['clawx-openai-image']);
  });

  it('imports the OpenAI-compatible image provider factory from the SDK (not a dist path)', async () => {
    const pluginSource = await readFile(
      join(repoRoot, 'resources/openclaw-plugins/clawx-openai-image/index.mjs'),
      'utf8',
    );
    expect(pluginSource).toContain("from 'openclaw/plugin-sdk/core'");
    expect(pluginSource).toContain('openclaw/plugin-sdk/image-generation');
    expect(pluginSource).not.toMatch(/\.\/dist\/runtime-/);
  });
});
