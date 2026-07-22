import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P4b-B2: settings.setMany host:invoke + Settings proxy UI path.
 * Does not exercise cron/chat/providers/gateway transport changes.
 */
test.describe('P4b-B2 settings.setMany facade', () => {
  test('host:invoke settings.setMany succeeds and Settings proxy save works', async ({
    launchElectronApp,
  }) => {
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
      await expect(page.getByTestId('main-layout')).toBeVisible({ timeout: 60_000 });

      const probe = await page.evaluate(async () => {
        type HostRes =
          | { ok: true; data: unknown }
          | { ok: false; error: { code: string; message: string } };

        if (!window.clawx?.hostInvoke) {
          return { hostInvoke: false as const };
        }

        const setMany = (await window.clawx.hostInvoke({
          id: 'p4b-setmany',
          module: 'settings',
          action: 'setMany',
          payload: { quickModelRefs: [{ path: 'p4b/test', label: 'p4b-test' }] },
        })) as HostRes;

        // Other settings actions may exist on Main; facade only documents setMany.
        // Unknown high-risk module still UNSUPPORTED for getApiKey-style probes.
        const denied = (await window.clawx.hostInvoke({
          id: 'p4b-key',
          module: 'providers',
          action: 'getApiKey',
          payload: 'openai',
        })) as HostRes;

        return {
          hostInvoke: true as const,
          setManyOk: setMany.ok,
          setManyData: setMany.ok ? setMany.data : setMany.error,
          getApiKeyCode: denied.ok ? 'OK' : denied.error.code,
        };
      });

      expect(probe.hostInvoke).toBe(true);
      if (probe.hostInvoke) {
        expect(probe.setManyOk).toBe(true);
        expect(probe.setManyData).toMatchObject({ success: true });
        expect(probe.getApiKeyCode).toBe('UNSUPPORTED');
      }

      // User-visible Settings proxy path (same as settings-proxy.spec, skipSetup variant)
      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

      const devModeToggle = page.getByTestId('settings-dev-mode-switch');
      await expect(devModeToggle).toBeVisible();
      if ((await devModeToggle.getAttribute('data-state')) !== 'checked') {
        await devModeToggle.click();
      }

      const proxyToggle = page.getByTestId('settings-proxy-toggle');
      const proxySaveButton = page.getByTestId('settings-proxy-save-button');
      await expect(page.getByTestId('settings-proxy-section')).toBeVisible();
      await expect(proxyToggle).toBeVisible();
      await expect(proxySaveButton).toBeVisible();

      if ((await proxyToggle.getAttribute('data-state')) !== 'checked') {
        await proxyToggle.click();
      }
      await expect(proxySaveButton).toBeEnabled();
      await proxySaveButton.click();

      await expect
        .poll(async () => {
          return await page.evaluate(async () => {
            type HostRes =
              | { ok: true; data: unknown }
              | { ok: false; error: { code: string; message: string } };

            const response = (await window.electron.ipcRenderer.invoke('app:request', {
              id: 'settings.getAll',
              module: 'settings',
              action: 'getAll',
            })) as HostRes;
            if (!response.ok) {
              throw new Error(response.error.message);
            }
            const settings = response.data as Record<string, unknown> | undefined;
            return Boolean(settings?.proxyEnabled);
          });
        }, { timeout: 30_000 })
        .toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });

});
