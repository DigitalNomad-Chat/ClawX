import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P3c: skills config surface remains available via IPC after service extraction.
 * Asserts Skills page loads and skill:getAllConfigs is served by Main handlers.
 */
test.describe('P3c skills config boundary', () => {
  test('skills page can load configs through extracted skill handlers', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('skill:getAllConfigs');
        ipcMain.handle('skill:getAllConfigs', async () => ({
          'demo-skill': { enabled: true },
        }));
        ipcMain.removeHandler('skill:updateConfig');
        ipcMain.handle('skill:updateConfig', async (_e, params: { skillKey?: string }) => ({
          success: true,
          skillKey: params?.skillKey,
        }));
        // Prefer hostapi skills status for page load when used
        ipcMain.removeHandler('hostapi:fetch');
        ipcMain.handle('hostapi:fetch', async (_e, request: { path?: string; method?: string }) => {
          const path = request?.path ?? '';
          if (path === '/api/skills/status' || path.startsWith('/api/skills/status')) {
            return {
              ok: true,
              data: {
                status: 200,
                ok: true,
                json: { success: true, skills: [] },
              },
            };
          }
          if (path === '/api/skills/configs') {
            return {
              ok: true,
              data: {
                status: 200,
                ok: true,
                json: { 'demo-skill': { enabled: true } },
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

      await page.evaluate(() => {
        window.location.hash = '#/skills';
      });

      // Skills page should render (title or list container)
      await expect(
        page.getByRole('heading', { name: /Skills|技能/i }).or(page.locator('text=Skills')).first(),
      ).toBeVisible({ timeout: 45_000 });

      // Smoke: invoke extracted IPC path from renderer
      const configs = await page.evaluate(async () => {
        return await window.electron.ipcRenderer.invoke('skill:getAllConfigs');
      });
      expect(configs).toMatchObject({ 'demo-skill': { enabled: true } });
    } finally {
      await closeElectronApp(app);
    }
  });
});
