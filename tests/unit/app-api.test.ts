import { beforeEach, describe, expect, it, vi } from 'vitest';

const runOpenClawDoctorMock = vi.fn();
const runOpenClawDoctorFixMock = vi.fn();

vi.mock('../../electron/utils/openclaw-doctor', () => ({
  runOpenClawDoctor: (...args: unknown[]) => runOpenClawDoctorMock(...args),
  runOpenClawDoctorFix: (...args: unknown[]) => runOpenClawDoctorFixMock(...args),
}));

describe('createAppApi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runOpenClawDoctorMock.mockResolvedValue({ success: true, exitCode: 0 });
    runOpenClawDoctorFixMock.mockResolvedValue({ success: true, exitCode: 0 });
  });

  it('defaults to diagnose mode', async () => {
    const { createAppApi } = await import('../../electron/services/app-api');
    const api = createAppApi();
    await api.openClawDoctor();
    expect(runOpenClawDoctorMock).toHaveBeenCalledTimes(1);
    expect(runOpenClawDoctorFixMock).not.toHaveBeenCalled();
  });

  it('runs fix when mode is fix', async () => {
    const { createAppApi } = await import('../../electron/services/app-api');
    const api = createAppApi();
    await api.openClawDoctor({ mode: 'fix' });
    expect(runOpenClawDoctorFixMock).toHaveBeenCalledTimes(1);
    expect(runOpenClawDoctorMock).not.toHaveBeenCalled();
  });
});
