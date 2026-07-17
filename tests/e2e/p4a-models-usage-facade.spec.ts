import type { ElectronApplication, Page } from '@playwright/test';
import {
  closeElectronApp,
  expect,
  getStableWindow,
  test,
} from './fixtures/electron';

const SAMPLE_USAGE = [
  {
    timestamp: new Date().toISOString(),
    sessionId: 'p4a-session-1',
    agentId: 'agent',
    model: 'p4a-ui-model',
    provider: 'test-provider',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 15,
    usageStatus: 'available' as const,
  },
];

/**
 * Install host:invoke mock for usage.recentTokenHistory.
 * success → ok array; unsupported-fallback → UNSUPPORTED (facade uses hostapi:fetch).
 */
async function installHostInvokeUsage(
  app: ElectronApplication,
  mode: 'host-success' | 'unsupported-fallback',
  sample: typeof SAMPLE_USAGE,
): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, args) => {
      const { sample: usage, mode: mockMode } = args as {
        sample: typeof SAMPLE_USAGE;
        mode: 'host-success' | 'unsupported-fallback';
      };

      ipcMain.removeHandler('host:invoke');
      ipcMain.handle(
        'host:invoke',
        async (_e, request: { module?: string; action?: string; id?: string }) => {
          if (request?.module === 'usage' && request?.action === 'recentTokenHistory') {
            if (mockMode === 'host-success') {
              return { id: request.id, ok: true, data: usage };
            }
            return {
              id: request.id,
              ok: false,
              error: {
                code: 'UNSUPPORTED',
                message: 'Unsupported host request: usage.recentTokenHistory',
              },
            };
          }
          return {
            id: request?.id,
            ok: false,
            error: {
              code: 'UNSUPPORTED',
              message: `Unsupported host request: ${request?.module}.${request?.action}`,
            },
          };
        },
      );

      // Hybrid hostapi:fetch — usage deterministic; gateway running; empty-ok otherwise.
      // Required for UNSUPPORTED fallback path and for Models shell incidental fetches.
      ipcMain.removeHandler('hostapi:fetch');
      ipcMain.handle('hostapi:fetch', async (_e, request: { path?: string }) => {
        const path = request?.path ?? '';
        if (path.startsWith('/api/usage/recent-token-history')) {
          return { ok: true, data: { status: 200, ok: true, json: usage } };
        }
        if (path.includes('/api/gateway/status')) {
          return {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: {
                state: 'running',
                port: 18789,
                pid: 1,
                gatewayReady: true,
                connectedAt: Date.now(),
              },
            },
          };
        }
        return { ok: true, data: { status: 200, ok: true, json: {} } };
      });
    },
    { sample, mode },
  );
}

async function openModelsWithUsageFetchArmed(page: Page): Promise<void> {
  // Production Models only fetches usage when gateway is running.
  // E2E opt-in flag (Models/index.tsx) arms fetch without live Gateway process.
  await page.evaluate(() => {
    window.localStorage.setItem('clawdock:e2e-force-gateway-running', '1');
  });
  await page.evaluate(() => {
    window.location.hash = '#/models';
  });
  // Remount so usage effect sees the flag
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.evaluate(() => {
    window.location.hash = '#/models';
  });
  await expect(page.getByTestId('models-page')).toBeVisible({ timeout: 60_000 });
}

/**
 * P4a: Models page real UI path for hostApi.usage —
 * (1) host:invoke success, (2) UNSUPPORTED → HTTP hostapi:fetch fallback.
 * Asserts token-usage-entry rows (not only raw IPC probes).
 */
test.describe('P4a Models usage facade', () => {
  test('Models page loads usage when host:invoke succeeds', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await installHostInvokeUsage(app, 'host-success', SAMPLE_USAGE);

      const invokeProbe = await page.evaluate(async () => {
        return await window.clawx!.hostInvoke({
          id: 'probe-success',
          module: 'usage',
          action: 'recentTokenHistory',
        });
      });
      expect(invokeProbe).toMatchObject({ ok: true });
      expect((invokeProbe as { data: unknown[] }).data[0]).toMatchObject({ model: 'p4a-ui-model' });

      await openModelsWithUsageFetchArmed(page);

      await expect
        .poll(async () => await page.getByTestId('token-usage-entry').count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(page.getByTestId('token-usage-entry').first()).toContainText(/p4a-ui-model/i);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('Models page loads usage via HTTP when host:invoke returns UNSUPPORTED', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await installHostInvokeUsage(app, 'unsupported-fallback', SAMPLE_USAGE);

      // Probe: raw host:invoke is UNSUPPORTED; HTTP path has sample (facade will use HTTP).
      const unsup = await page.evaluate(async () => {
        return await window.clawx!.hostInvoke({
          id: 'probe-unsup',
          module: 'usage',
          action: 'recentTokenHistory',
        });
      });
      expect(unsup).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });

      const httpProbe = await page.evaluate(async () => {
        return await window.electron.ipcRenderer.invoke('hostapi:fetch', {
          path: '/api/usage/recent-token-history',
          method: 'GET',
        });
      }) as { ok?: boolean; data?: { json?: unknown } };
      expect(httpProbe?.data?.json).toEqual(
        expect.arrayContaining([expect.objectContaining({ model: 'p4a-ui-model' })]),
      );

      await openModelsWithUsageFetchArmed(page);

      await expect
        .poll(async () => await page.getByTestId('token-usage-entry').count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(page.getByTestId('token-usage-entry').first()).toContainText(/p4a-ui-model/i);
    } finally {
      await closeElectronApp(app);
    }
  });
});
