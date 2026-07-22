import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const excludedFallbackFiles = new Set(['src/lib/host-api-client.ts']);

function* walk(dir: string, extensions: string[]): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full, extensions);
    } else if (st.isFile() && extensions.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

function readFiles(dirs: string[], extensions: string[]): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const dir of dirs) {
    for (const file of walk(join(repoRoot, dir), extensions)) {
      const rel = relative(repoRoot, file);
      if (excludedFallbackFiles.has(rel)) continue;
      files.push({ path: rel, content: readFileSync(file, 'utf8') });
    }
  }
  return files;
}

const channels = ['dialog:save', 'dialog:message', 'shell:showItemInFolder'];

describe('P5-C dialog save/message + shell showItemInFolder zero-call evidence', () => {
  it('has no direct business invokeIpc calls in renderer/preload (excluding fallback shim)', () => {
    const files = readFiles(['src', 'electron/preload'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of channels) {
        const regex = new RegExp(`invokeIpc\\(['"]${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no window.electron.ipcRenderer.invoke business calls in renderer', () => {
    const files = readFiles(['src'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of channels) {
        const regex = new RegExp(`ipcRenderer\\.invoke\\(['"]${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no direct test calls for these legacy channels', () => {
    const files = readFiles(['tests'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of channels) {
        const regex = new RegExp(`(invokeIpc\\(['"]|ipcRenderer\\.invoke\\(['"])${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
