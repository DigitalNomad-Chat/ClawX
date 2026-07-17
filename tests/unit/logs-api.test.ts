import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRecentLogsMock = vi.fn();
const readLogFileMock = vi.fn();
const getLogFilePathMock = vi.fn();
const getLogDirMock = vi.fn();
const listLogFilesMock = vi.fn();

vi.mock('../../electron/utils/logger', () => ({
  logger: {
    getRecentLogs: (...args: unknown[]) => getRecentLogsMock(...args),
    readLogFile: (...args: unknown[]) => readLogFileMock(...args),
    getLogFilePath: (...args: unknown[]) => getLogFilePathMock(...args),
    getLogDir: (...args: unknown[]) => getLogDirMock(...args),
    listLogFiles: (...args: unknown[]) => listLogFilesMock(...args),
  },
}));

describe('createLogsApi', () => {
  beforeEach(() => {
    vi.resetModules();
    getRecentLogsMock.mockReset().mockReturnValue(['a']);
    readLogFileMock.mockReset().mockResolvedValue('body');
    getLogFilePathMock.mockReset().mockReturnValue('/tmp/app.log');
    getLogDirMock.mockReset().mockReturnValue('/tmp/logs');
    listLogFilesMock.mockReset().mockResolvedValue([]);
  });

  it('getRecent accepts bare count', async () => {
    const { createLogsApi } = await import('../../electron/services/logs-api');
    createLogsApi().getRecent(20);
    expect(getRecentLogsMock).toHaveBeenCalledWith(20);
  });

  it('readFile defaults tail when omitted', async () => {
    const { createLogsApi } = await import('../../electron/services/logs-api');
    await createLogsApi().readFile();
    expect(readLogFileMock).toHaveBeenCalledWith(200);
  });

  it('getDir/getFilePath/listFiles delegate', async () => {
    const { createLogsApi } = await import('../../electron/services/logs-api');
    const api = createLogsApi();
    expect(api.getDir()).toBe('/tmp/logs');
    expect(api.getFilePath()).toBe('/tmp/app.log');
    await api.listFiles();
    expect(listLogFilesMock).toHaveBeenCalled();
  });
});
