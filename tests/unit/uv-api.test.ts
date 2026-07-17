import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkUvInstalledMock = vi.fn();
const installUvMock = vi.fn();
const setupManagedPythonMock = vi.fn();

vi.mock('../../electron/utils/uv-setup', () => ({
  checkUvInstalled: (...args: unknown[]) => checkUvInstalledMock(...args),
  installUv: (...args: unknown[]) => installUvMock(...args),
  setupManagedPython: (...args: unknown[]) => setupManagedPythonMock(...args),
}));

describe('createUvApi', () => {
  beforeEach(() => {
    vi.resetModules();
    checkUvInstalledMock.mockReset();
    installUvMock.mockReset();
    setupManagedPythonMock.mockReset();
  });

  it('check returns installation status', async () => {
    checkUvInstalledMock.mockResolvedValue(true);
    const { createUvApi } = await import('../../electron/services/uv-api');
    await expect(createUvApi().check()).resolves.toBe(true);
  });

  it('installAll installs when missing then setups python', async () => {
    checkUvInstalledMock.mockResolvedValue(false);
    installUvMock.mockResolvedValue(undefined);
    setupManagedPythonMock.mockResolvedValue(undefined);
    const { createUvApi } = await import('../../electron/services/uv-api');
    await expect(createUvApi().installAll()).resolves.toEqual({ success: true });
    expect(installUvMock).toHaveBeenCalled();
    expect(setupManagedPythonMock).toHaveBeenCalled();
  });

  it('installAll returns error object on failure', async () => {
    checkUvInstalledMock.mockResolvedValue(true);
    setupManagedPythonMock.mockRejectedValue(new Error('py fail'));
    const { createUvApi } = await import('../../electron/services/uv-api');
    await expect(createUvApi().installAll()).resolves.toMatchObject({ success: false });
  });
});
