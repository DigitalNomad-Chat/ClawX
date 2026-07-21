import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4b-B6: ChatInput attachment picker and media preview use hostApi facade.
 * Does not exercise chat send, runtime events, history-poll, or rw-workspace.
 */
test.describe('P4b-B6 media periphery facade', () => {
  test('ChatInput attach button uses hostApi.dialog.open', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const calls: Array<{ module: string; action: string; payload: unknown }> = [];

      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      // Override host:invoke to record dialog/shell calls while letting other modules pass through.
      await app.evaluate(({ ipcMain }) => {
        (globalThis as { __p4bB6Calls?: Array<{ module: string; action: string; payload: unknown }> }).__p4bB6Calls = [];
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (_event, request: { module?: string; action?: string; payload?: unknown; id?: string }) => {
          const { module, action, payload } = request;
          (globalThis as { __p4bB6Calls: Array<{ module: string; action: string; payload: unknown }> }).__p4bB6Calls.push({
            module: module ?? '',
            action: action ?? '',
            payload,
          });
          if (module === 'dialog' && action === 'open') {
            return {
              id: request.id ?? 'x',
              ok: true,
              data: { canceled: false, filePaths: ['/tmp/b6-test-file.txt'] },
            };
          }
          if (module === 'shell' && action === 'showItemInFolder') {
            return { id: request.id ?? 'x', ok: true, data: undefined };
          }
          // Fallback to UNSUPPORTED so any unexpected call is visible.
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

      // Click the paperclip attach button (title varies by locale).
      const attachButton = page.locator(
        'button[title="Attach files"], button[title="添加文件"], button[title="Прикрепить файлы"], button[title="ファイルを添付"]',
      ).first();
      await expect(attachButton).toBeEnabled({ timeout: 5_000 });
      await attachButton.click({ timeout: 5_000 });

      // Give the async staging a moment to settle.
      await page.waitForTimeout(500);

      const allCalls = await app.evaluate(() =>
        (globalThis as { __p4bB6Calls?: Array<{ module: string; action: string; payload: unknown }> }).__p4bB6Calls ?? []
      );
      const dialogCalls = allCalls.filter(
        (c) => c.module === 'dialog' && c.action === 'open',
      );
      expect(dialogCalls.length).toBeGreaterThanOrEqual(1);
      expect(dialogCalls[0]).toMatchObject({
        module: 'dialog',
        action: 'open',
        payload: { properties: ['openFile', 'multiSelections'] },
      });

      // Also probe hostApi.shell.showItemInFolder path directly from renderer.
      const shellProbe = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };
        if (!window.clawx?.hostInvoke) return { hostInvoke: false as const };
        const res = (await window.clawx.hostInvoke({
          id: 'p4b-b6-shell',
          module: 'shell',
          action: 'showItemInFolder',
          payload: { path: '/tmp/b6-test-file.txt' },
        })) as HostRes;
        return {
          hostInvoke: true as const,
          shellOk: res.ok,
          shellCode: res.ok ? null : res.error?.code,
        };
      });

      expect(shellProbe.hostInvoke).toBe(true);
      if (shellProbe.hostInvoke) {
        expect(shellProbe.shellOk).toBe(true);
      }

      const shellCalls = (await app.evaluate(() =>
        (globalThis as { __p4bB6Calls?: Array<{ module: string; action: string; payload: unknown }> }).__p4bB6Calls ?? []
      )).filter(
        (c) => c.module === 'shell' && c.action === 'showItemInFolder',
      );
      expect(shellCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      await closeElectronApp(app);
    }
  });
});
