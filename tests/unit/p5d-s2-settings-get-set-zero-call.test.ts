import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const channels = ['settings:get', 'settings:getAll', 'settings:set', 'settings:reset'];
const channelPattern = channels.join('|');

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

describe('P5-D-S2 settings get/getAll/set/reset zero-call evidence', () => {
  it('has no direct ipcRenderer.invoke settings:* calls in renderer', () => {
    const files = readFiles(['src'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      const regex = new RegExp(`ipcRenderer\\.invoke\\(['"](${channelPattern})['"]`, 'g');
      if (regex.test(content)) {
        hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no direct ipcRenderer.invoke settings:* calls in tests', () => {
    const files = readFiles(['tests'], ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const { path, content } of files) {
      const regex = new RegExp(`ipcRenderer\\.invoke\\(['"](${channelPattern})['"]`, 'g');
      if (regex.test(content)) {
        hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no ipcMain.handle registration for settings:* handlers in main process', () => {
    const mainHandlers = readFileSync(join(repoRoot, 'electron/main/ipc-handlers.ts'), 'utf8');
    const hits: string[] = [];
    for (const channel of channels) {
      const regex = new RegExp(`ipcMain\\.handle\\(['"]${channel}['"]`, 'g');
      if (regex.test(mainHandlers)) {
        hits.push(channel);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no settings:* fallback entries in host-api-client', () => {
    const client = readFileSync(join(repoRoot, 'src/lib/host-api-client.ts'), 'utf8');
    const hits: string[] = [];
    for (const channel of channels) {
      const regex = new RegExp(`invokeIpc\\(['"]${channel}['"]`, 'g');
      if (regex.test(client)) {
        hits.push(channel);
      }
    }
    expect(hits).toEqual([]);
  });
});
