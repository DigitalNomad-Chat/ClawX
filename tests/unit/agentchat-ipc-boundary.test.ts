/**
 * Static boundary guard: AgentChat page must not call ipcRenderer directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/pages/AgentChat/index.tsx'), 'utf8');

describe('AgentChat IPC boundary', () => {
  it('does not call window.electron.ipcRenderer.invoke directly', () => {
    expect(src).not.toMatch(/window\.electron\.ipcRenderer\.invoke/);
  });

  it('does not call window.electron.ipcRenderer.on directly', () => {
    expect(src).not.toMatch(/window\.electron\.ipcRenderer\.on/);
  });

  it('does not call window.electron.ipcRenderer.off directly', () => {
    expect(src).not.toMatch(/window\.electron\.ipcRenderer\.off/);
  });

  it('routes backend access through kernel-bridge / host-events imports', () => {
    expect(src).toMatch(/from ['"]@\/lib\/kernel-bridge['"]/);
    expect(src).toMatch(/from ['"]@\/lib\/host-events['"]/);
  });
});
