import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4b-B7: Chat page directory attachment onOpen uses hostApi.shell.openPath
 * (host:invoke), not direct renderer IPC. Does not exercise chat send,
 * history-poll, runtime events, or session HTTP paths.
 */
test.describe('P4b-B7 Chat periphery facade', () => {
  test('host:invoke serves shell.openPath in Chat context', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      // Override host:invoke to record and respond to shell.openPath.
      await app.evaluate(({ ipcMain }) => {
        (globalThis as { __p4bB7Calls?: Array<{ module: string; action: string; payload: unknown }> }).__p4bB7Calls = [];
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (_event, request: { module?: string; action?: string; payload?: unknown; id?: string }) => {
          const { module, action, payload } = request;
          (globalThis as { __p4bB7Calls: Array<{ module: string; action: string; payload: unknown }> }).__p4bB7Calls.push({
            module: module ?? '',
            action: action ?? '',
            payload,
          });
          if (module === 'shell' && action === 'openPath') {
            return { id: request.id ?? 'x', ok: true, data: '' };
          }
          return {
            id: request.id ?? 'x',
            ok: false,
            error: {
              code: 'UNSUPPORTED',
              message: `Unsupported host request: ${module}.${action}`,
            },
          };
        });
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: 30_000 });

      // Probe the facade path from renderer (contextBridge cannot be overwritten,
      // so we go through window.clawx.hostInvoke which hostApi.shell.openPath uses).
      const probe = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };
        if (!window.clawx?.hostInvoke) return { hostInvoke: false as const };
        const res = (await window.clawx.hostInvoke({
          id: 'p4b-b7-shell-openPath',
          module: 'shell',
          action: 'openPath',
          payload: { path: '/tmp/b7-chat-dir' },
        })) as HostRes;
        return {
          hostInvoke: true as const,
          shellOk: res.ok,
          shellCode: res.ok ? null : res.error?.code,
        };
      });

      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.shellOk).toBe(true);
      }

      const calls = await app.evaluate(() =>
        (globalThis as { __p4bB7Calls?: Array<{ module: string; action: string; payload: unknown }> }).__p4bB7Calls ?? []
      );
      const shellCalls = calls.filter((c) => c.module === 'shell' && c.action === 'openPath');
      expect(shellCalls.length).toBeGreaterThanOrEqual(1);
      expect(shellCalls[0]).toMatchObject({
        module: 'shell',
        action: 'openPath',
        payload: { path: '/tmp/b7-chat-dir' },
      });
    } finally {
      await closeElectronApp(app);
    }
  });
});
