import type { Page } from '@playwright/test';
import { completeSetup, expect, installIpcMocks, test } from './fixtures/electron';

async function enableDeveloperMode(page: Page): Promise<void> {
  await page.getByTestId('sidebar-nav-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  const devModeToggle = page.getByTestId('settings-dev-mode-switch');
  if ((await devModeToggle.getAttribute('data-state')) !== 'checked') {
    await devModeToggle.click();
  }
  await expect(devModeToggle).toHaveAttribute('data-state', 'checked');
}

const CONFIGURED_GET_KEY = '["/api/media/image-generation","GET"]';

function configuredHostApiMock() {
  return {
    [CONFIGURED_GET_KEY]: {
      ok: true,
      data: {
        status: 200,
        ok: true,
        json: {
          success: true,
          config: {
            primary: 'clawx-openai-image/gpt-image-2',
            fallbacks: [],
            timeoutMs: 180000,
          },
          autoProviderFallback: false,
          defaultAgentId: 'default',
          agents: [
            {
              id: 'default',
              name: 'Default',
              isDefault: true,
              provider: 'clawx-openai-image',
              configured: true,
            },
          ],
          openAiRelay: {
            enabled: true,
            baseUrl: 'https://taolat.com/v1',
            model: 'gpt-image-2',
            providerKey: 'clawx-openai-image',
            apiKeyConfigured: true,
          },
        },
      },
    },
  };
}

test.describe('Image generation settings page', () => {
  test('keeps image generation hidden until developer mode is enabled', async ({ page }) => {
    await completeSetup(page);

    // Before dev mode: nav entry and route are hidden.
    await expect(page.getByTestId('sidebar-nav-image-generation')).toHaveCount(0);
    await page.evaluate(() => {
      window.location.hash = '#/image-generation';
    });
    await expect(page.getByTestId('image-generation-page')).toHaveCount(0);

    await enableDeveloperMode(page);
    await expect(page.getByTestId('sidebar-nav-image-generation')).toBeVisible();

    await page.getByTestId('sidebar-nav-image-generation').click();
    await expect(page.getByTestId('image-generation-page')).toBeVisible();
    await expect(page.getByTestId('image-generation-settings')).toBeVisible();
    await expect(page.getByTestId('image-generation-settings-title')).toBeVisible();
    await expect(page.getByTestId('image-generation-openai-relay')).toBeVisible();
    await expect(page.getByTestId('image-generation-relay-model')).toBeVisible();
    await expect(page.getByTestId('image-generation-save')).toBeVisible();
  });

  test('configures an independent OpenAI-compatible image endpoint', async ({ page }) => {
    await completeSetup(page);
    await enableDeveloperMode(page);
    await page.getByTestId('sidebar-nav-image-generation').click();

    await expect(page.getByTestId('image-generation-settings')).toBeVisible();
    await expect(page.getByTestId('image-generation-relay-base-url')).toBeVisible();
    await page.getByTestId('image-generation-relay-base-url').fill('https://taolat.com/v1');
    await page.getByTestId('image-generation-relay-model').fill('gpt-image-2');
    await page.getByTestId('image-generation-relay-api-key').fill('sk-test-image');

    await expect(page.getByTestId('image-generation-relay-model')).toHaveValue('gpt-image-2');
    await expect(page.getByTestId('image-generation-save')).toBeEnabled();
  });

  test('shows configured image API key status when relay is configured', async ({ electronApp, page }) => {
    await installIpcMocks(electronApp, {
      hostApi: configuredHostApiMock(),
    });

    await completeSetup(page);
    await enableDeveloperMode(page);
    await page.getByTestId('sidebar-nav-image-generation').click();

    await expect(page.getByTestId('image-generation-settings')).toBeVisible();
    await expect(page.getByTestId('image-generation-relay-base-url')).toHaveValue('https://taolat.com/v1');
    await expect(page.getByTestId('image-generation-relay-model')).toHaveValue('gpt-image-2');
    await expect(page.getByTestId('image-generation-relay-api-key')).toHaveValue('');
    await expect(page.getByTestId('image-generation-api-key-status')).not.toBeEmpty();
    await expect(page.getByTestId('image-generation-relay-api-key')).toHaveAttribute('placeholder', /.+/);
  });
});
