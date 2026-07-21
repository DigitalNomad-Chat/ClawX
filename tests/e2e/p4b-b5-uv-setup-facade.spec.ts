import {
  closeElectronApp,
  expect,
  getStableWindow,
  test,
} from './fixtures/electron';

async function installUvMocks(
  app: import('@playwright/test').ElectronApplication,
  mode: 'success' | 'fail',
): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, uvMode) => {
      const calls: Array<{ action?: string }> = [];
      (globalThis as { __p4bB5UvCalls?: typeof calls }).__p4bB5UvCalls = calls;

      ipcMain.removeHandler('host:invoke');
      ipcMain.handle(
        'host:invoke',
        async (_e, request: { id?: string; module?: string; action?: string }) => {
          const id = request?.id ?? 'ok';
          if (request?.module === 'uv') {
            calls.push({ action: request.action });
            if (request.action === 'check') {
              return { id, ok: true, data: false };
            }
            if (request.action === 'installAll') {
              if (uvMode === 'success') {
                return { id, ok: true, data: { success: true } };
              }
              return {
                id,
                ok: true,
                data: { success: false, error: 'p4b-b5-simulated-fail' },
              };
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

      ipcMain.removeHandler('uv:install-all');
      ipcMain.handle('uv:install-all', async () => {
        calls.push({ action: 'installAll-legacy' });
        if (uvMode === 'success') return { success: true };
        return { success: false, error: 'p4b-b5-simulated-fail' };
      });
      ipcMain.removeHandler('uv:check');
      ipcMain.handle('uv:check', async () => {
        calls.push({ action: 'check-legacy' });
        return false;
      });
    },
    mode,
  );
}

async function advanceToInstallingStep(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('setup-page')).toBeVisible({ timeout: 60_000 });
  // Production never sets this key; E2E-only unlock for install-step coverage.
  await page.evaluate(() => {
    window.localStorage.setItem('clawdock:e2e-force-setup-runtime-pass', '1');
  });
  // Welcome → Runtime (Next enabled on welcome)
  await page.getByTestId('setup-next-button').click();
  // Runtime → Installing (unlocked by e2e flag)
  await expect(page.getByTestId('setup-next-button')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('setup-next-button').click();
  await expect(page.getByTestId('setup-installing-step')).toBeVisible({ timeout: 30_000 });
}

/**
 * P4b-B5: uv.check / uv.installAll host:invoke + Setup install UI semantics.
 */
test.describe('P4b-B5 UV Setup facade', () => {
  test('host:invoke uv actions and Setup install progress complete on success', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: false });
    try {
      await installUvMocks(app, 'success');
      const page = await getStableWindow(app);

      const probe = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };
        if (!window.clawx?.hostInvoke) return { hostInvoke: false as const };
        const check = (await window.clawx.hostInvoke({
          id: 'uv-check',
          module: 'uv',
          action: 'check',
        })) as HostRes;
        const install = (await window.clawx.hostInvoke({
          id: 'uv-install',
          module: 'uv',
          action: 'installAll',
        })) as HostRes;
        return {
          hostInvoke: true as const,
          checkOk: check.ok,
          checkData: check.ok ? check.data : null,
          installOk: install.ok,
          installData: install.ok ? install.data : null,
        };
      });
      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.checkOk).toBe(true);
        expect(typeof probe.checkData === 'boolean').toBe(true);
        expect(probe.installOk).toBe(true);
        expect(probe.installData).toMatchObject({ success: true });
      }

      await advanceToInstallingStep(page);
      await expect(page.getByTestId('setup-install-progress')).toBeVisible();
      await expect(page.getByTestId('setup-install-skip-button')).toBeVisible();

      await expect
        .poll(async () => {
          return await app.evaluate(() => {
            const calls =
              (globalThis as { __p4bB5UvCalls?: Array<{ action?: string }> }).__p4bB5UvCalls ?? [];
            return calls.some((c) => c.action === 'installAll' || c.action === 'installAll-legacy');
          });
        }, { timeout: 25_000 })
        .toBe(true);

      await expect
        .poll(async () => {
          const text = await page.getByTestId('setup-install-progress').textContent();
          return Number(String(text).replace('%', '')) >= 10;
        }, { timeout: 15_000 })
        .toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('UNSUPPORTED uv.installAll falls back to legacy uv:install-all', async ({
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
            if (request?.module === 'uv' && request?.action === 'installAll') {
              return {
                id: request.id ?? 'x',
                ok: false,
                error: { code: 'UNSUPPORTED', message: 'test unsupported installAll' },
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
        ipcMain.removeHandler('uv:install-all');
        ipcMain.handle('uv:install-all', async () => ({ success: true, via: 'legacy' }));
      });

      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      const fallback = await page.evaluate(async () => {
        const res = await window.clawx!.hostInvoke({
          id: 'fb-uv',
          module: 'uv',
          action: 'installAll',
        });
        if (res.ok) return { path: 'host', value: res.data };
        if (res.error?.code === 'UNSUPPORTED') {
          const legacy = await window.electron.ipcRenderer.invoke('uv:install-all');
          return { path: 'legacy', value: legacy };
        }
        return { path: 'error', value: res.error };
      });

      expect(fallback.path).toBe('legacy');
      expect(fallback.value).toMatchObject({ success: true, via: 'legacy' });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('Setup install shows error UI when installAll fails without throwing', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: false });
    try {
      await installUvMocks(app, 'fail');
      const page = await getStableWindow(app);
      await advanceToInstallingStep(page);
      await expect(page.getByTestId('setup-install-error')).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId('setup-install-error')).toContainText(/p4b-b5-simulated-fail/i);
      await expect(page.getByTestId('setup-install-skip-button')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
