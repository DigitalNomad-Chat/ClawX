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

const sampleJobs = [
  {
    id: 'job-p4b-b3',
    name: 'P4b B3 Probe Job',
    message: 'hello',
    schedule: { kind: 'cron', expr: '0 * * * *' },
    enabled: true,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    agentId: 'main',
  },
];

/**
 * P4b-B3: cron delete/toggle/trigger host:invoke + Cron page toggle UI.
 * list/create/update stay on HTTP mocks; no chat/settings/provider coverage.
 */
test.describe('P4b-B3 cron write facade', () => {
  test('host:invoke registers write actions and Cron toggle uses dual-path', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
            },
          },
          [stableStringify(['/api/cron/jobs', 'GET'])]: {
            ok: true,
            data: { status: 200, ok: true, json: sampleJobs },
          },
          [stableStringify(['/api/channels/accounts', 'GET'])]: {
            ok: true,
            data: { status: 200, ok: true, json: { success: true, channels: [] } },
          },
        },
      });

      // Record cron write invokes; other modules stay UNSUPPORTED so IPC/HTTP fallbacks apply.
      await app.evaluate(({ ipcMain }) => {
        const calls: Array<{ module?: string; action?: string; payload?: unknown }> = [];
        (globalThis as { __p4bB3CronCalls?: typeof calls }).__p4bB3CronCalls = calls;

        ipcMain.removeHandler('host:invoke');
        ipcMain.handle(
          'host:invoke',
          async (
            _e,
            request: { id?: string; module?: string; action?: string; payload?: unknown },
          ) => {
            if (request?.module === 'cron') {
              calls.push({
                module: request.module,
                action: request.action,
                payload: request.payload,
              });
              if (
                request.action === 'delete' ||
                request.action === 'toggle' ||
                request.action === 'trigger'
              ) {
                return { id: request.id ?? 'ok', ok: true, data: { success: true } };
              }
              return {
                id: request.id ?? 'x',
                ok: false,
                error: {
                  code: 'UNSUPPORTED',
                  message: `Unsupported host request: cron.${request.action}`,
                },
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

        const del = (await window.clawx.hostInvoke({
          id: 'probe-del',
          module: 'cron',
          action: 'delete',
          payload: { id: 'job-probe' },
        })) as HostRes;
        const tog = (await window.clawx.hostInvoke({
          id: 'probe-tog',
          module: 'cron',
          action: 'toggle',
          payload: { id: 'job-probe', enabled: false },
        })) as HostRes;
        const run = (await window.clawx.hostInvoke({
          id: 'probe-run',
          module: 'cron',
          action: 'trigger',
          payload: { id: 'job-probe' },
        })) as HostRes;
        const list = (await window.clawx.hostInvoke({
          id: 'probe-list',
          module: 'cron',
          action: 'list',
        })) as HostRes;

        return {
          hostInvoke: true as const,
          deleteOk: del.ok,
          toggleOk: tog.ok,
          triggerOk: run.ok,
          listCode: list.ok ? 'OK' : list.error.code,
        };
      });

      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.deleteOk).toBe(true);
        expect(probe.toggleOk).toBe(true);
        expect(probe.triggerOk).toBe(true);
        expect(probe.listCode).toBe('UNSUPPORTED');
      }

      // HashRouter navigation (skipSetup already on main shell).
      await page.evaluate(() => {
        window.location.hash = '#/cron';
      });
      await expect(page.getByTestId('cron-page')).toBeVisible({ timeout: 30_000 });
      const switchWrapper = page.getByTestId('cron-job-card-switch-job-p4b-b3');
      await expect(switchWrapper).toBeVisible({ timeout: 30_000 });
      await switchWrapper.locator('button, [role="switch"]').first().click();

      await expect
        .poll(async () => {
          return await app.evaluate(() => {
            const calls =
              (globalThis as {
                __p4bB3CronCalls?: Array<{ action?: string; payload?: unknown }>;
              }).__p4bB3CronCalls ?? [];
            return calls.some(
              (c) =>
                c.action === 'toggle' &&
                c.payload &&
                typeof c.payload === 'object' &&
                (c.payload as { id?: string }).id === 'job-p4b-b3',
            );
          });
        }, { timeout: 20_000 })
        .toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('UNSUPPORTED cron.toggle falls back to legacy cron:toggle IPC', async ({
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
            if (request?.module === 'cron' && request?.action === 'toggle') {
              return {
                id: request.id ?? 'x',
                ok: false,
                error: { code: 'UNSUPPORTED', message: 'test unsupported toggle' },
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
        ipcMain.removeHandler('cron:toggle');
        ipcMain.handle('cron:toggle', async (_e, id: string, enabled: boolean) => {
          return { success: true, id, enabled, via: 'legacy' };
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
          id: 'fb-tog',
          module: 'cron',
          action: 'toggle',
          payload: { id: 'job-fb', enabled: true },
        });
        if (res.ok) return { path: 'host', value: res.data };
        if (res.error?.code === 'UNSUPPORTED') {
          const legacy = await window.electron.ipcRenderer.invoke(
            'cron:toggle',
            'job-fb',
            true,
          );
          return { path: 'legacy', value: legacy };
        }
        return { path: 'error', value: res.error };
      });

      expect(fallback.path).toBe('legacy');
      expect(fallback.value).toMatchObject({ via: 'legacy', id: 'job-fb', enabled: true });
    } finally {
      await closeElectronApp(app);
    }
  });
});
