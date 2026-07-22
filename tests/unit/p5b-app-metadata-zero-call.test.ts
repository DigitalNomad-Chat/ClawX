import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();

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
      files.push({ path: relative(repoRoot, file), content: readFileSync(file, 'utf8') });
    }
  }
  return files;
}

const metadataChannels = [
  'app:version',
  'app:name',
  'app:getPath',
  'app:platform',
  'app:quit',
  'app:relaunch',
];

describe('P5-B app metadata legacy IPC zero-call evidence', () => {
  it('has no direct invokeIpc app metadata calls in renderer/preload', () => {
    const files = readFiles(['src', 'electron/preload'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of metadataChannels) {
        const regex = new RegExp(`invokeIpc\\(['"]${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no window.electron.ipcRenderer.invoke app metadata calls in renderer', () => {
    const files = readFiles(['src'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of metadataChannels) {
        const regex = new RegExp(`ipcRenderer\\.invoke\\(['"]${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no direct app metadata test/harness calls', () => {
    const files = readFiles(['tests', 'harness/specs'], ['.ts', '.tsx', '.md']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      for (const channel of metadataChannels) {
        const regex = new RegExp(`(invokeIpc\\(['"]|ipcRenderer\\.invoke\\(['"])${channel}['"]`, 'g');
        if (regex.test(content)) {
          hits.push(`${path}:${channel}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
