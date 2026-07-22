import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P3c: skills config surface remains available via IPC after service extraction.
 * Asserts Skills page loads and skills config is served by the host:invoke registry.
 */
test.describe('P3c skills config boundary', () => {
  test('skills page can load configs through host:invoke registry', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 1, gatewayReady: true },
      });

      await app.evaluate(({ ipcMain }) => {
        // Mock host:invoke skills config path for the renderer smoke probe
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (_event, request: { module?: string; action?: string }) => {
          if (request?.module === 'skills' && request?.action === 'getAllConfigs') {
            return { 'demo-skill': { enabled: true } };
          }
          return { ok: false, error: { code: 'UNSUPPORTED', message: 'Not mocked' } };
        });

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

      // Smoke: invoke skills config through host:invoke registry
      const configs = await page.evaluate(async () => {
        return await window.clawx.hostInvoke({ module: 'skills', action: 'getAllConfigs' });
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
