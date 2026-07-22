import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const channel = 'usage:recentTokenHistory';

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

describe('P5-D-U usage:recentTokenHistory legacy IPC zero-call evidence', () => {
  it('has no invokeIpc fallback or business calls in src/preload', () => {
    const files = readFiles(['src', 'electron/preload'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      const regex = new RegExp(`invokeIpc\\(['"]${channel}['"]`, 'g');
      if (regex.test(content)) {
        hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no window.electron.ipcRenderer.invoke business calls in renderer', () => {
    const files = readFiles(['src'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      const regex = new RegExp(`ipcRenderer\\.invoke\\(['"]${channel}['"]`, 'g');
      if (regex.test(content)) {
        hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no direct test calls for usage:recentTokenHistory legacy channel', () => {
    const files = readFiles(['tests'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      const regex = new RegExp(`(invokeIpc\\(['"]|ipcRenderer\\.invoke\\(['"])${channel}['"]`, 'g');
      if (regex.test(content)) {
        hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no ipcMain.handle registration for usage:recentTokenHistory in main process', () => {
    const mainHandlers = readFileSync(join(repoRoot, 'electron/main/ipc-handlers.ts'), 'utf8');
    const regex = new RegExp(`ipcMain\\.handle\\(['"]${channel}['"]`, 'g');
    expect(regex.test(mainHandlers)).toBe(false);
  });

  it('keeps HTTP fallback for usage.recentTokenHistory in host-api-client', () => {
    const client = readFileSync(join(repoRoot, 'src/lib/host-api-client.ts'), 'utf8');
    expect(client).toContain('/api/usage/recent-token-history');
    const legacyRegex = new RegExp(`invokeIpc\\(['"]${channel}['"]`, 'g');
    expect(legacyRegex.test(client)).toBe(false);
  });
});
