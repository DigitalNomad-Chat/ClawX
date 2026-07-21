import {
  closeElectronApp,
  expect,
  getStableWindow,
  installIpcMocks,
  test,
} from './fixtures/electron';

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}

async function installUvMocks(
  app: import('@playwright/test').ElectronApplication,
  mode: 'success' | 'fail' | 'fallback',
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
              if (uvMode === 'fallback') {
                return {
                  id,
                  ok: false,
                  error: { code: 'UNSUPPORTED', message: 'test unsupported installAll' },
                };
              }
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
        if (uvMode === 'success' || uvMode === 'fallback') return { success: true };
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

async function advanceToInstallingStep(
  page: import('@playwright/test').Page,
  app: import('@playwright/test').ElectronApplication,
): Promise<void> {
  await installIpcMocks(app, {
    gatewayStatus: { state: 'running', port: 18789 },
    hostApi: {
      [stableStringify(['/api/gateway/status', 'GET'])]: {
        ok: true,
        data: { status: 200, ok: true, json: { state: 'running', port: 18789 } },
      },
    },
  });

  await expect(page.getByTestId('setup-page')).toBeVisible({ timeout: 60_000 });
  // Welcome → Runtime (Next enabled on welcome)
  await page.getByTestId('setup-next-button').click();
  // Runtime → Installing (unlocked when gateway status is running)
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

      await advanceToInstallingStep(page, app);
      await expect(page.getByTestId('setup-install-progress')).toBeVisible();
      await expect(page.getByTestId('setup-install-skip-button')).toBeVisible();

      await expect
        .poll(async () => {
          return await app.evaluate(() => {
            const calls =
              (globalThis as { __p4bB5UvCalls?: Array<{ action?: string }> }).__p4bB5UvCalls ?? [];
            return calls.some((c) => c.action === 'installAll');
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

  test('UNSUPPORTED uv.installAll falls back to legacy uv:install-all through Setup', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: false });
    try {
      await installUvMocks(app, 'fallback');
      const page = await getStableWindow(app);
      await advanceToInstallingStep(page, app);

      await expect(page.getByTestId('setup-install-progress')).toBeVisible();

      // InstallingContent calls hostApi.uv.installAll(); fallback should hit legacy handler.
      await expect
        .poll(async () => {
          return await app.evaluate(() => {
            const calls =
              (globalThis as { __p4bB5UvCalls?: Array<{ action?: string }> }).__p4bB5UvCalls ?? [];
            return calls.some((c) => c.action === 'installAll-legacy');
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

  test('Setup install shows error UI when installAll fails without throwing', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: false });
    try {
      await installUvMocks(app, 'fail');
      const page = await getStableWindow(app);
      await advanceToInstallingStep(page, app);
      await expect(page.getByTestId('setup-install-error')).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId('setup-install-error')).toContainText(/p4b-b5-simulated-fail/i);
      await expect(page.getByTestId('setup-install-skip-button')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
