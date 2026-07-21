import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4b-B1: window / shell / dialog host:invoke + TitleBar UI surface.
 * Does not exercise chat send, settings, cron, providers, or gateway transport.
 */
test.describe('P4b-B1 window/shell/dialog facade', () => {
  test('host:invoke serves window/shell/dialog and TitleBar remains usable', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
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

        if (!window.clawx?.hostInvoke) {
          return { hostInvoke: false as const };
        }

        const isMax = (await window.clawx.hostInvoke({
          id: 'p4b-win-max',
          module: 'window',
          action: 'isMaximized',
        })) as HostRes;

        const shellPath = (await window.clawx.hostInvoke({
          id: 'p4b-shell-path',
          module: 'shell',
          action: 'openPath',
          payload: { path: '/tmp' },
        })) as HostRes;

        // dialog.message opens a real OS box — probe registration only (unknown action → UNSUPPORTED
        // proves dialog module is on the registry router, not missing).
        const dialogUnknown = (await window.clawx.hostInvoke({
          id: 'p4b-dialog-unknown',
          module: 'dialog',
          action: 'notARealDialogAction',
        })) as HostRes;

        // High-risk still not on facade path for providers getApiKey
        const denied = (await window.clawx.hostInvoke({
          id: 'p4b-key',
          module: 'providers',
          action: 'getApiKey',
          payload: 'openai',
        })) as HostRes;

        return {
          hostInvoke: true as const,
          isMaxOk: isMax.ok,
          isMaxData: isMax.ok ? isMax.data : isMax.error?.code,
          shellOk: shellPath.ok,
          shellCode: shellPath.ok ? null : shellPath.error?.code,
          dialogUnknownCode: dialogUnknown.ok ? 'OK' : dialogUnknown.error?.code,
          getApiKeyCode: denied.ok ? 'OK' : denied.error.code,
        };
      });

      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.isMaxOk).toBe(true);
        expect(typeof probe.isMaxData === 'boolean').toBe(true);
        // openPath returns empty string on success or may error on missing path — either registered
        expect(probe.shellOk === true || probe.shellCode === 'INTERNAL').toBe(true);
        expect(probe.dialogUnknownCode).toBe('UNSUPPORTED');
        expect(probe.getApiKeyCode).toBe('UNSUPPORTED');
      }

      // UI: Windows titlebar uses hostApi.window; other platforms have drag region / null.
      const platform = await page.evaluate(() => window.electron?.platform);
      if (platform === 'win32') {
        const titlebar = page.getByTestId('windows-titlebar');
        await expect(titlebar).toBeVisible({ timeout: 15_000 });
        // Click minimize — should not crash renderer (host:invoke or legacy IPC).
        await titlebar.locator('button[title="Minimize"]').click({ timeout: 5_000 });
        await expect(page.getByTestId('main-layout')).toBeVisible();
      } else if (platform === 'darwin') {
        await expect(page.getByTestId('main-layout')).toHaveAttribute('data-platform', 'darwin');
      } else {
        await expect(page.getByTestId('main-layout')).toBeVisible();
      }
    } finally {
      await closeElectronApp(app);
    }
  });

  test('UNSUPPORTED window action falls back via dual-path without crashing shell', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      // Temporarily force host:invoke window.isMaximized → UNSUPPORTED, legacy still works.
      await app.evaluate(({ ipcMain }) => {
        const previous = (globalThis as { __p4bB1PrevHostInvoke?: unknown }).__p4bB1PrevHostInvoke;
        void previous;
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (_e, request: { module?: string; action?: string; id?: string }) => {
          if (request?.module === 'window' && request?.action === 'isMaximized') {
            return {
              id: request.id ?? 'x',
              ok: false,
              error: { code: 'UNSUPPORTED', message: 'test unsupported' },
            };
          }
          // Pass through other modules with UNSUPPORTED so client may fallback
          return {
            id: request?.id ?? 'x',
            ok: false,
            error: {
              code: 'UNSUPPORTED',
              message: `Unsupported host request: ${request?.module}.${request?.action}`,
            },
          };
        });
      });

      // Reload so renderer keeps bridge but Main returns UNSUPPORTED for window
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      const fallbackProbe = await page.evaluate(async () => {
        // Simulate facade fallback: hostInvoke UNSUPPORTED → legacy window:isMaximized
        const res = await window.clawx!.hostInvoke({
          id: 'fb-win',
          module: 'window',
          action: 'isMaximized',
        });
        if (res.ok) return { path: 'host', value: res.data };
        if (res.error?.code === 'UNSUPPORTED') {
          const legacy = await window.electron.ipcRenderer.invoke('window:isMaximized');
          return { path: 'legacy', value: legacy };
        }
        return { path: 'error', value: res.error };
      });

      expect(fallbackProbe.path).toBe('legacy');
      expect(typeof fallbackProbe.value).toBe('boolean');
    } finally {
      await closeElectronApp(app);
    }
  });
});
