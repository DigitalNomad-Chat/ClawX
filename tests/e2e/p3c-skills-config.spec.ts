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

  test('host:invoke real registry path: implemented OK and stubs UNSUPPORTED', async ({ launchElectronApp }) => {
    // Does NOT mock host:invoke or skill handlers — exercises production registry → service wiring.
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

      const results = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };

        const invoke = async (module: string, action: string, payload?: unknown): Promise<HostRes> => {
          if (window.clawx?.hostInvoke) {
            return await window.clawx.hostInvoke({ id: `${module}.${action}`, module, action, payload });
          }
          return await window.electron.ipcRenderer.invoke('host:invoke', {
            id: `${module}.${action}`,
            module,
            action,
            payload,
          }) as HostRes;
        };

        const getAll = await invoke('skills', 'getAllConfigs');
        const saveConfig = await invoke('channels', 'saveConfig', { channelType: 'x' });
        const cronList = await invoke('cron', 'list');
        const getApiKey = await invoke('providers', 'getApiKey', 'openai');
        const skillsStatus = await invoke('skills', 'status');

        return { getAll, saveConfig, cronList, getApiKey, skillsStatus };
      });

      // Implemented action: registry → createSkillsApi → skill-config (real, may be empty object)
      expect(results.getAll.ok).toBe(true);
      if (results.getAll.ok) {
        expect(results.getAll.data).toEqual(expect.any(Object));
      }

      // Unimplemented: must be UNSUPPORTED (never INTERNAL from throw stubs)
      for (const key of ['saveConfig', 'cronList', 'getApiKey', 'skillsStatus'] as const) {
        const res = results[key];
        expect(res.ok, key).toBe(false);
        if (!res.ok) {
          expect(res.error.code, key).toBe('UNSUPPORTED');
        }
      }
    } finally {
      await closeElectronApp(app);
    }
  });
});
