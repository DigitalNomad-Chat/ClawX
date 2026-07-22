import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const chatPagePath = join(process.cwd(), 'src/pages/Chat/index.tsx');
const chatPageSource = readFileSync(chatPagePath, 'utf8');

describe('P4b-B7 Chat periphery hostApi boundary', () => {
  it('uses hostApi.shell.openPath for directory attachment onOpen', () => {
    expect(chatPageSource).toContain('hostApi.shell.openPath(file.filePath)');
  });

  it('does not directly invoke legacy shell:openPath in Chat page', () => {
    expect(chatPageSource).not.toMatch(/invokeIpc\(['"]shell:openPath['"]/);
  });
});
