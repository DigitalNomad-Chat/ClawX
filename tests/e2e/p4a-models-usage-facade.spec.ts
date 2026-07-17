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

async function mockUsageHostPaths(
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

      if (mockMode === 'unsupported-fallback') {
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
      }
    },
    { sample, mode },
  );
}

async function openModelsPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.setItem('clawdock:e2e-force-gateway-running', '1');
    window.location.hash = '#/models';
  });
  await expect(page.getByTestId('models-page')).toBeVisible({ timeout: 60_000 });
}

async function remountModels(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.evaluate(() => {
    window.location.hash = '#/models';
  });
  await expect(page.getByTestId('models-page')).toBeVisible({ timeout: 30_000 });
}

/**
 * P4a: Models page real UI path for hostApi.usage —
 * open Models first (shell intact), then mock host paths and remount to fetch.
 */
test.describe('P4a Models usage facade', () => {
  test('Models page loads usage when host:invoke succeeds', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);

      // Shell first — do not mock hostapi:fetch before Models mounts
      await openModelsPage(page);

      await mockUsageHostPaths(app, 'host-success', SAMPLE_USAGE);

      const invokeProbe = await page.evaluate(async () => {
        return await window.clawx!.hostInvoke({
          id: 'probe-success',
          module: 'usage',
          action: 'recentTokenHistory',
        });
      });
      expect(invokeProbe).toMatchObject({ ok: true });
      expect((invokeProbe as { data: unknown[] }).data[0]).toMatchObject({ model: 'p4a-ui-model' });

      // Remount so usage effect runs against mocks + force-gateway flag
      await remountModels(page);

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

      // Mount Models before replacing hostapi:fetch (full replace can break remount).
      await openModelsPage(page);
      await mockUsageHostPaths(app, 'unsupported-fallback', SAMPLE_USAGE);

      const unsup = await page.evaluate(async () => {
        return await window.clawx!.hostInvoke({
          id: 'probe-unsup',
          module: 'usage',
          action: 'recentTokenHistory',
        });
      });
      expect(unsup).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });

      // Re-fetch without remount: focus triggers usageRefreshNonce when gateway forced on.
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await expect
        .poll(async () => await page.getByTestId('token-usage-entry').count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(page.getByTestId('token-usage-entry').first()).toContainText(/p4a-ui-model/i);
    } finally {
      await closeElectronApp(app);
    }
  });
});
