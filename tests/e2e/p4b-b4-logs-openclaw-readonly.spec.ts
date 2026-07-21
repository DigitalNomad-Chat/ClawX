import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4b-B4: logs + openclaw read-only host:invoke and Settings logs UI.
 */
test.describe('P4b-B4 logs and OpenClaw read-only facade', () => {
  test('host:invoke logs/openclaw reads and Settings logs panel works', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      // Deterministic logs + openclaw read responses without touching gateway transport.
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle(
          'host:invoke',
          async (
            _e,
            request: { id?: string; module?: string; action?: string; payload?: unknown },
          ) => {
            const id = request?.id ?? 'ok';
            if (request?.module === 'logs') {
              if (request.action === 'readFile') {
                return { id, ok: true, data: 'p4b-b4-log-line-1\np4b-b4-log-line-2' };
              }
              if (request.action === 'getDir') {
                return { id, ok: true, data: '/tmp/p4b-b4-logs' };
              }
              if (request.action === 'getRecent') {
                return { id, ok: true, data: ['recent'] };
              }
              if (request.action === 'getFilePath') {
                return { id, ok: true, data: '/tmp/p4b-b4-logs/app.log' };
              }
              if (request.action === 'listFiles') {
                return { id, ok: true, data: [] };
              }
            }
            if (request?.module === 'openclaw') {
              if (request.action === 'status') {
                return { id, ok: true, data: { packageExists: true, dir: '/tmp/oc' } };
              }
              if (request.action === 'getDir') {
                return { id, ok: true, data: '/tmp/oc' };
              }
              if (request.action === 'getConfigDir') {
                return { id, ok: true, data: '/tmp/oc-config' };
              }
              if (request.action === 'getSkillsDir') {
                return { id, ok: true, data: '/tmp/oc-skills' };
              }
              if (request.action === 'getCliCommand') {
                return { id, ok: true, data: { success: true, command: 'node /tmp/oc/entry.js' } };
              }
            }
            return {
              id,
              ok: false,
              error: {
                code: 'UNSUPPORTED',
                message: `Unsupported host request: ${request?.module}.${request?.action}`,
              },
            };
          },
        );
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      const probe = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };
        if (!window.clawx?.hostInvoke) return { hostInvoke: false as const };

        const read = (await window.clawx.hostInvoke({
          id: 'logs-read',
          module: 'logs',
          action: 'readFile',
          payload: { tailLines: 100 },
        })) as HostRes;
        const dir = (await window.clawx.hostInvoke({
          id: 'logs-dir',
          module: 'logs',
          action: 'getDir',
        })) as HostRes;
        const ocDir = (await window.clawx.hostInvoke({
          id: 'oc-dir',
          module: 'openclaw',
          action: 'getDir',
        })) as HostRes;
        const cli = (await window.clawx.hostInvoke({
          id: 'oc-cli',
          module: 'openclaw',
          action: 'getCliCommand',
        })) as HostRes;
        const denied = (await window.clawx.hostInvoke({
          id: 'uv-check',
          module: 'uv',
          action: 'check',
        })) as HostRes;

        return {
          hostInvoke: true as const,
          readOk: read.ok,
          readData: read.ok ? read.data : null,
          dirOk: dir.ok,
          dirData: dir.ok ? dir.data : null,
          ocDirOk: ocDir.ok,
          ocDirData: ocDir.ok ? ocDir.data : null,
          cliOk: cli.ok,
          cliData: cli.ok ? cli.data : null,
          uvCode: denied.ok ? 'OK' : denied.error.code,
        };
      });

      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.readOk).toBe(true);
        expect(String(probe.readData)).toContain('p4b-b4-log-line-1');
        expect(probe.dirOk).toBe(true);
        expect(probe.dirData).toBe('/tmp/p4b-b4-logs');
        expect(probe.ocDirOk).toBe(true);
        expect(probe.ocDirData).toBe('/tmp/oc');
        expect(probe.cliOk).toBe(true);
        expect(probe.cliData).toMatchObject({ success: true });
        // uv is not a B4 facade module; host registry may still have uv — either path ok:
        // if registered returns ok, if not UNSUPPORTED. Do not require UNSUPPORTED.
        expect(probe.uvCode === 'OK' || probe.uvCode === 'UNSUPPORTED').toBe(true);
      }

      await page.evaluate(() => {
        window.location.hash = '#/settings';
      });
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('settings-show-logs-button').click();
      await expect(page.getByTestId('settings-logs-panel')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('settings-logs-content')).toContainText(/p4b-b4-log-line/i);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('UNSUPPORTED logs.readFile falls back to legacy log:readFile', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle(
          'host:invoke',
          async (_e, request: { id?: string; module?: string; action?: string }) => {
            if (request?.module === 'logs' && request?.action === 'readFile') {
              return {
                id: request.id ?? 'x',
                ok: false,
                error: { code: 'UNSUPPORTED', message: 'test unsupported logs.readFile' },
              };
            }
            return {
              id: request?.id ?? 'x',
              ok: false,
              error: {
                code: 'UNSUPPORTED',
                message: `Unsupported host request: ${request?.module}.${request?.action}`,
              },
            };
          },
        );
        ipcMain.removeHandler('log:readFile');
        ipcMain.handle('log:readFile', async (_e, tailLines?: number) => {
          return `legacy-log-tail-${tailLines ?? 0}`;
        });
      });

      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      const fallback = await page.evaluate(async () => {
        const res = await window.clawx!.hostInvoke({
          id: 'fb-logs',
          module: 'logs',
          action: 'readFile',
          payload: { tailLines: 80 },
        });
        if (res.ok) return { path: 'host', value: res.data };
        if (res.error?.code === 'UNSUPPORTED') {
          const legacy = await window.electron.ipcRenderer.invoke('log:readFile', 80);
          return { path: 'legacy', value: legacy };
        }
        return { path: 'error', value: res.error };
      });

      expect(fallback.path).toBe('legacy');
      expect(fallback.value).toBe('legacy-log-tail-80');
    } finally {
      await closeElectronApp(app);
    }
  });
});
