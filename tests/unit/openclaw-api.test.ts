import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getOpenClawStatusMock,
  getOpenClawSkillsDirMock,
  ensureDirMock,
  getOpenClawCliCommandMock,
  existsSyncMock,
} = vi.hoisted(() => ({
  getOpenClawStatusMock: vi.fn(),
  getOpenClawSkillsDirMock: vi.fn(),
  ensureDirMock: vi.fn(),
  getOpenClawCliCommandMock: vi.fn(),
  existsSyncMock: vi.fn(() => true),
}));

vi.mock('../../electron/utils/paths', () => ({
  getOpenClawStatus: (...args: unknown[]) => getOpenClawStatusMock(...args),
  getOpenClawSkillsDir: (...args: unknown[]) => getOpenClawSkillsDirMock(...args),
  ensureDir: (...args: unknown[]) => ensureDirMock(...args),
}));

vi.mock('../../electron/utils/openclaw-cli', () => ({
  getOpenClawCliCommand: (...args: unknown[]) => getOpenClawCliCommandMock(...args),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => existsSyncMock(...args),
    },
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => existsSyncMock(...args),
    },
  };
});

describe('createOpenClawApi', () => {
  beforeEach(() => {
    vi.resetModules();
    getOpenClawStatusMock.mockReset();
    getOpenClawSkillsDirMock.mockReset();
    ensureDirMock.mockReset();
    getOpenClawCliCommandMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation(() => true);
    getOpenClawStatusMock.mockReturnValue({
      packageExists: true,
      dir: '/tmp/oc',
      entryPath: '/tmp/oc/entry.js',
    });
    getOpenClawSkillsDirMock.mockReturnValue('/tmp/skills');
    getOpenClawCliCommandMock.mockReturnValue('node /tmp/oc/entry.js');
  });

  it('status returns package snapshot', async () => {
    const { createOpenClawApi } = await import('../../electron/services/openclaw-api');
    const api = createOpenClawApi();
    expect(api.status()).toMatchObject({ packageExists: true });
  });

  it('getSkillsDir ensures directory exists', async () => {
    const { createOpenClawApi } = await import('../../electron/services/openclaw-api');
    const api = createOpenClawApi();
    expect(api.getSkillsDir()).toBe('/tmp/skills');
    expect(ensureDirMock).toHaveBeenCalledWith('/tmp/skills');
  });

  it('getCliCommand returns command when package ready', async () => {
    const { createOpenClawApi } = await import('../../electron/services/openclaw-api');
    const api = createOpenClawApi();
    expect(api.getCliCommand()).toEqual({ success: true, command: 'node /tmp/oc/entry.js' });
  });

  it('getCliCommand fails when package missing', async () => {
    getOpenClawStatusMock.mockReturnValue({
      packageExists: false,
      dir: '/missing',
      entryPath: '/missing/entry.js',
    });
    const { createOpenClawApi } = await import('../../electron/services/openclaw-api');
    const api = createOpenClawApi();
    expect(api.getCliCommand()).toMatchObject({ success: false });
  });
});
