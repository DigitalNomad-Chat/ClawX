import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternalMock = vi.fn();
const showItemInFolderMock = vi.fn();
const openPathMock = vi.fn();

vi.mock('electron', () => ({
  shell: {
    openExternal: (...args: unknown[]) => openExternalMock(...args),
    showItemInFolder: (...args: unknown[]) => showItemInFolderMock(...args),
    openPath: (...args: unknown[]) => openPathMock(...args),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
    getVersion: vi.fn().mockReturnValue('0.0.0-test'),
    getName: vi.fn().mockReturnValue('test'),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
}));

describe('createShellApi', () => {
  beforeEach(() => {
    vi.resetModules();
    openExternalMock.mockReset().mockResolvedValue(undefined);
    showItemInFolderMock.mockReset();
    openPathMock.mockReset().mockResolvedValue('');
  });

  it('openExternal accepts bare url string', async () => {
    const { createShellApi } = await import('../../electron/services/shell-api');
    await createShellApi().openExternal('https://example.com');
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com');
  });

  it('showItemInFolder expands ~', async () => {
    const { createShellApi, expandShellPath } = await import('../../electron/services/shell-api');
    createShellApi().showItemInFolder('~/Documents');
    expect(showItemInFolderMock).toHaveBeenCalledWith(expandShellPath('~/Documents'));
  });

  it('rejects empty path', async () => {
    const { createShellApi } = await import('../../electron/services/shell-api');
    expect(() => createShellApi().showItemInFolder('')).toThrow(/path is required/);
  });
});
