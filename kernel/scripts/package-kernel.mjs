/**
 * Package Kernel Script
 * Bundles the kernel with esbuild and copies agent assets to build/kernel/
 *
 * Usage: node scripts/package-kernel.mjs
 *
 * Output:
 *   build/kernel/
 *     kernel.js          ← esbuild bundle (single file)
 *     agents/
 *       manifest.json
 *       *.enc
 */
import { execSync } from 'child_process';
import { cpSync, mkdirSync, existsSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kernelRoot = resolve(__dirname, '..');
const projectRoot = resolve(kernelRoot, '..');
const buildDir = resolve(projectRoot, 'build', 'kernel');

console.log('[package-kernel] Building ClawX kernel...');

// Step 1: Clean build directory
if (existsSync(buildDir)) {
  rmSync(buildDir, { recursive: true });
}
mkdirSync(buildDir, { recursive: true });

// Step 2: esbuild bundle
console.log('[package-kernel] Bundling with esbuild...');
execSync(
  `npx esbuild src/main.ts ` +
    `--bundle ` +
    `--platform=node ` +
    `--format=esm ` +
    `--outfile=${resolve(buildDir, 'kernel.js')} ` +
    `--external:crypto ` +
    `--external:fs ` +
    `--external:path ` +
    `--external:child_process ` +
    `--external:os ` +
    `--external:net ` +
    `--external:http ` +
    `--external:https ` +
    `--external:url ` +
    `--external:util ` +
    `--external:stream ` +
    `--external:events ` +
    `--external:buffer ` +
    `--external:string_decoder ` +
    `--external:zlib ` +
    `--external:ws ` +
    `--minify ` +
    `--target=node20`,
  {
    cwd: kernelRoot,
    stdio: 'inherit',
  },
);

console.log('[package-kernel] Bundle created:', resolve(buildDir, 'kernel.js'));

// Step 3: Copy agent assets
const agentsSrc = resolve(kernelRoot, 'agents');
const agentsDest = resolve(buildDir, 'agents');

if (existsSync(agentsSrc)) {
  cpSync(agentsSrc, agentsDest, { recursive: true });
  console.log('[package-kernel] Agents copied to:', agentsDest);
} else {
  console.warn('[package-kernel] WARNING: No agents directory found at', agentsSrc);
}

console.log('[package-kernel] Done! Kernel package at:', buildDir);
