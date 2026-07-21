import { expect, getStableWindow, test } from './fixtures/electron';

test.describe('Hermes product removal', () => {
  test('Setup runtime step does not mention Hermes', async ({ electronApp }) => {
    const page = await getStableWindow(electronApp);
    await expect(page.getByTestId('setup-page')).toBeVisible({ timeout: 60_000 });

    // Welcome → Runtime
    await page.getByTestId('setup-next-button').click();
    await expect(page.getByTestId('setup-runtime-step')).toBeVisible({ timeout: 15_000 });

    const runtimePanel = page.locator('[data-testid="setup-runtime-step"]');
    await expect(runtimePanel).toContainText('Node.js');
    await expect(runtimePanel).not.toContainText('Hermes');
    await expect(runtimePanel).not.toContainText('hermes');
    await expect(runtimePanel).not.toContainText('pip install hermes-agent');
  });

  test('Settings does not surface Hermes CLI install UI', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    const page = await getStableWindow(app);

    await page.getByTestId('sidebar-nav-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

    const devModeToggle = page.getByTestId('settings-dev-mode-switch');
    await expect(devModeToggle).toBeVisible();
    if ((await devModeToggle.getAttribute('data-state')) !== 'checked') {
      await devModeToggle.click();
    }

    const body = page.locator('body');
    await expect(body).not.toContainText('Hermes CLI');
    await expect(body).not.toContainText('pip install hermes-agent');
  });
});
