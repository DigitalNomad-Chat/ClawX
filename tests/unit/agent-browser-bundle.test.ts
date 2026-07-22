// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

function getBundledAgentBrowserPath(): string {
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binName = platform === 'win32' ? 'agent-browser.exe' : 'agent-browser';
  // In dev the download script places binaries under resources/bin/<platform-arch>/.
  return join(process.cwd(), 'resources', 'bin', target, binName);
}

const binPath = getBundledAgentBrowserPath();
const binExists = existsSync(binPath);

describe('agent-browser bundle', () => {
  it.skipIf(!binExists)('places an executable agent-browser binary for the current platform', () => {
    expect(existsSync(binPath)).toBe(true);
  });

  it.skipIf(!binExists)('reports a version via --version', () => {
    const output = execSync(`"${binPath}" --version`, { encoding: 'utf8', timeout: 10_000 });
    expect(output.trim()).toMatch(/^agent-browser \d+\.\d+\.\d+/);
  });
});
