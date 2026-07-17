import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4a: renderer hostApi facade uses production host:invoke for low-risk usage,
 * and rejects high-risk modules (no skills/providers/channels on facade).
 */
test.describe('P4a hostApi facade', () => {
  test('usage.recentTokenHistory resolves via host:invoke or dual-path fallback', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      // Real host:invoke stays registered; only seed hostapi:fetch for HTTP fallback path.
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('hostapi:fetch');
        ipcMain.handle('hostapi:fetch', async (_e, request: { path?: string }) => {
          const path = request?.path ?? '';
          if (path.startsWith('/api/usage/recent-token-history')) {
            return {
              ok: true,
              data: {
                status: 200,
                ok: true,
                json: [{ model: 'e2e-model', totalTokens: 3, inputTokens: 1, outputTokens: 2 }],
              },
            };
          }
          if (path === '/api/gateway/status') {
            return {
              ok: true,
              data: {
                status: 200,
                ok: true,
                json: { state: 'running', port: 18789, gatewayReady: true },
              },
            };
          }
          return { ok: true, data: { status: 200, ok: true, json: {} } };
        });
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
      }

      const result = await page.evaluate(async () => {
        // Prefer typed facade if the renderer bundle exports it on window for tests;
        // otherwise exercise host:invoke + same fallback rules as host-api-client.
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };

        const viaHostInvoke = async (): Promise<unknown> => {
          if (!window.clawx?.hostInvoke) return null;
          const res = await window.clawx.hostInvoke({
            id: 'p4a-usage',
            module: 'usage',
            action: 'recentTokenHistory',
          }) as HostRes;
          if (res.ok) return res.data;
          if (res.error?.code === 'UNSUPPORTED') {
            return await window.electron.ipcRenderer.invoke('hostapi:fetch', {
              path: '/api/usage/recent-token-history',
              method: 'GET',
            });
          }
          throw new Error(res.error?.message || 'usage failed');
        };

        const data = await viaHostInvoke();
        // Also prove high-risk modules are not silently registered as writable providers.getApiKey
        let getApiKeyCode: string | null = null;
        if (window.clawx?.hostInvoke) {
          const denied = await window.clawx.hostInvoke({
            id: 'p4a-key',
            module: 'providers',
            action: 'getApiKey',
            payload: 'openai',
          }) as HostRes;
          getApiKeyCode = denied.ok ? 'OK' : denied.error.code;
        }
        return { data, getApiKeyCode };
      });

      // host:invoke usage may return real disk scan (array) or we used HTTP fallback envelope
      const payload = result.data as { ok?: boolean; data?: { json?: unknown } } | unknown;
      const entries = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && 'data' in (payload as object)
          ? (payload as { data?: { json?: unknown } }).data?.json
          : null;

      expect(Array.isArray(entries) || Array.isArray(payload)).toBe(true);
      expect(result.getApiKeyCode).toBe('UNSUPPORTED');
    } finally {
      await closeElectronApp(app);
    }
  });
});
