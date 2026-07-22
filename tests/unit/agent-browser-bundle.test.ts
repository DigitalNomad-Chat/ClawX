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

describe('agent-browser bundle', () => {
  it('places an executable agent-browser binary for the current platform', () => {
    const binPath = getBundledAgentBrowserPath();
    expect(existsSync(binPath)).toBe(true);
  });

  it('reports a version via --version', () => {
    const binPath = getBundledAgentBrowserPath();
    if (!existsSync(binPath)) {
      return;
    }
    const output = execSync(`"${binPath}" --version`, { encoding: 'utf8', timeout: 10_000 });
    expect(output.trim()).toMatch(/^agent-browser \d+\.\d+\.\d+/);
  });
});
