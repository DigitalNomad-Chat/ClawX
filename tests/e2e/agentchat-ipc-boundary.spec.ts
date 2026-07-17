import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

/**
 * P1: AgentChat must initialize via host-lib boundary (invokeIpc / subscribeHostEvent).
 * Main handlers are mocked; UI asserts ready state after HashRouter navigation.
 */
test.describe('AgentChat IPC boundary', () => {
  test('loads agent chat via mocked marketplace/kernel handlers', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
      });

      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('marketplace:getAgent');
        ipcMain.handle('marketplace:getAgent', async (_event, agentId: string) => ({
          success: true,
          agent: {
            id: agentId,
            name: 'E2E Agent',
            nickname: 'e2e',
            emoji: '🤖',
            creature: 'bot',
            vibe: 'calm',
            description: 'e2e fixture agent',
            tags: [],
            scenarios: [],
            version: '0.0.0-test',
          },
        }));

        ipcMain.removeHandler('kernel-llm:checkActive');
        ipcMain.handle('kernel-llm:checkActive', async () => ({
          success: true,
          providerName: 'fixture',
          model: 'fixture-model',
          needsSetup: false,
        }));

        ipcMain.removeHandler('history:list');
        ipcMain.handle('history:list', async () => ({
          success: true,
          sessions: [],
        }));

        ipcMain.removeHandler('marketplace:hireAgent');
        ipcMain.handle('marketplace:hireAgent', async () => ({
          success: true,
          sessionId: 'e2e-session-1',
        }));

        ipcMain.removeHandler('kernel:subscribe');
        ipcMain.handle('kernel:subscribe', async () => ({ success: true }));

        ipcMain.removeHandler('kernel:unsubscribe');
        ipcMain.handle('kernel:unsubscribe', async () => ({ success: true }));

        ipcMain.removeHandler('kernel:skillList');
        ipcMain.handle('kernel:skillList', async () => ({ success: true, skills: [] }));
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      // App uses HashRouter — navigate by hash change
      await page.evaluate(() => {
        window.location.hash = '#/goclaw/chat/e2e-agent';
      });

      await expect(page.getByTestId('agent-chat-page')).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId('agent-chat-agent-name')).toHaveText('E2E Agent', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('agent-chat-connected')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('agent-chat-connected')).toContainText(/已连接/);
    } finally {
      await closeElectronApp(app);
    }
  });
});
