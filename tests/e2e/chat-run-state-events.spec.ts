import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

const MAIN_SESSION_KEY = 'agent:main:main';

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}

test.describe('ClawX chat run state events', () => {
  test('keeps stop control active across non-terminal gateway phase end', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        gatewayRpc: {
          [stableStringify(['sessions.list', { includeDerivedTitles: true, includeLastMessage: true }])]: {
            success: true,
            result: {
              sessions: [{ key: MAIN_SESSION_KEY, displayName: 'main' }],
            },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200 }])]: {
            success: true,
            result: { messages: [] },
          },
          [stableStringify(['chat.send', null])]: {
            success: true,
            result: { runId: 'run-e2e' },
          },
        },
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
            },
          },
          [stableStringify(['/api/agents', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { success: true, agents: [{ id: 'main', name: 'Main' }] },
            },
          },
        },
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill('run long task');
      await page.getByTestId('chat-composer-send').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', 'Stop');

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('gateway:notification', {
          method: 'agent',
          params: {
            runId: 'run-e2e',
            sessionKey: 'agent:main:main',
            data: { phase: 'end' },
          },
        });
      });

      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', 'Stop');

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('gateway:notification', {
          method: 'agent',
          params: {
            runId: 'run-e2e',
            sessionKey: 'agent:main:main',
            data: { phase: 'completed' },
          },
        });
      });

      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', 'Send');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('shows clear image preview states for generated media while hydration retries', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    const gatewayUrl = '/api/chat/media/outgoing/agent%3Amain%3Aimage-preview/image-1/full';
    const history = [
      {
        role: 'assistant',
        id: 'generated-image',
        timestamp: Date.now() / 1000,
        content: [{
          type: 'image',
          url: gatewayUrl,
          mimeType: 'image/png',
          alt: 'generated.png',
        }],
      },
    ];

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        gatewayRpc: {
          [stableStringify(['sessions.list', { includeDerivedTitles: true, includeLastMessage: true }])]: {
            success: true,
            result: {
              sessions: [{ key: MAIN_SESSION_KEY, displayName: 'main' }],
            },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200 }])]: {
            success: true,
            result: { messages: history },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200, maxChars: 500000 }])]: {
            success: true,
            result: { messages: history },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000 }])]: {
            success: true,
            result: { messages: history },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000, maxChars: 500000 }])]: {
            success: true,
            result: { messages: history },
          },
        },
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
            },
          },
          [stableStringify(['/api/agents', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { success: true, agents: [{ id: 'main', name: 'Main' }] },
            },
          },
          [stableStringify(['/api/files/thumbnails', 'POST'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { [gatewayUrl]: { preview: null, fileSize: 0 } },
            },
          },
        },
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      // loadMissingPreviews retries at 300/900/1800ms then marks unavailable.
      await expect(page.getByTestId('image-preview-unavailable')).toBeVisible({ timeout: 15_000 });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('settles image run when history delivers generated media', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    const gatewayUrl = '/api/chat/media/outgoing/agent%3Amain%3Aimage-settle/tomato/full';
    const prompt = 'generate tomato image';
    const deliveredHistory = [
      {
        role: 'user',
        id: 'user-prompt',
        timestamp: Date.now() / 1000,
        content: prompt,
      },
      {
        role: 'assistant',
        id: 'image-tool-turn',
        timestamp: Date.now() / 1000 + 1,
        content: [{
          type: 'toolCall',
          id: 'call_image_1',
          name: 'image_generate',
          arguments: { prompt: 'tomato' },
        }],
      },
      {
        role: 'toolresult',
        id: 'image-tool-result',
        toolName: 'image_generate',
        timestamp: Date.now() / 1000 + 2,
        content: [{
          type: 'text',
          text: 'Background task started for image generation (27443fdb-6cca-48e6-a3a7-ee34b0491aee).',
        }],
      },
      {
        role: 'assistant',
        id: 'image-media-turn',
        timestamp: Date.now() / 1000 + 3,
        content: [{ type: 'text', text: 'Tomato image is ready.' }],
        _attachedFiles: [{
          fileName: 'tomato.png',
          mimeType: 'image/png',
          fileSize: 128,
          preview: 'data:image/png;base64,aaa',
          gatewayUrl,
          source: 'gateway-media',
        }],
      },
    ];

    const baseGatewayRpc = {
      [stableStringify(['sessions.list', { includeDerivedTitles: true, includeLastMessage: true }])]: {
        success: true,
        result: {
          sessions: [{ key: MAIN_SESSION_KEY, displayName: 'main' }],
        },
      },
      [stableStringify(['chat.send', null])]: {
        success: true,
        result: { runId: 'run-image-settle' },
      },
    };

    const historyKeys = [
      stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200 }]),
      stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200, maxChars: 500000 }]),
      stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000 }]),
      stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000, maxChars: 500000 }]),
    ];

    const emptyHistoryRpc = Object.fromEntries(
      historyKeys.map((key) => [key, { success: true, result: { messages: [] } }]),
    );
    const deliveredHistoryRpc = Object.fromEntries(
      historyKeys.map((key) => [key, { success: true, result: { messages: deliveredHistory } }]),
    );

    const baseHostApi = {
      [stableStringify(['/api/gateway/status', 'GET'])]: {
        ok: true,
        data: {
          status: 200,
          ok: true,
          json: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        },
      },
      [stableStringify(['/api/agents', 'GET'])]: {
        ok: true,
        data: {
          status: 200,
          ok: true,
          json: { success: true, agents: [{ id: 'main', name: 'Main' }] },
        },
      },
      [stableStringify(['/api/files/thumbnails', 'POST'])]: {
        ok: true,
        data: {
          status: 200,
          ok: true,
          json: {
            [gatewayUrl]: {
              preview: 'data:image/png;base64,aaa',
              fileSize: 128,
            },
          },
        },
      },
    };

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        gatewayRpc: {
          ...baseGatewayRpc,
          ...emptyHistoryRpc,
        },
        hostApi: baseHostApi,
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill(prompt);
      await page.getByTestId('chat-composer-send').click();
      // Title is locale-sensitive (en: Stop/Send, zh: 停止/发送).
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/);

      // History now contains image_generate + delivered media (history-only settle path).
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        gatewayRpc: {
          ...baseGatewayRpc,
          ...deliveredHistoryRpc,
        },
        hostApi: baseHostApi,
      });

      // Refresh is a user-visible control that reloads chat.history without
      // requiring #1094 runtime events. Match en/zh toolbar labels.
      await page.getByRole('button', { name: /refresh chat|refresh|刷新/i }).click();

      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute(
        'title',
        /^(Send|发送)$/,
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('chat-typing-indicator')).toHaveCount(0);
      await expect(page.getByTestId('chat-activity-indicator')).toHaveCount(0);
      await expect(page.getByText('Tomato image is ready.')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('ignores a late first chat.send result after a newer send is running', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
        gatewayRpc: {
          [stableStringify(['sessions.list', { includeDerivedTitles: true, includeLastMessage: true }])]: {
            success: true,
            result: {
              sessions: [{ key: MAIN_SESSION_KEY, displayName: 'main' }],
            },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200 }])]: {
            success: true,
            result: { messages: [] },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200, maxChars: 500000 }])]: {
            success: true,
            result: { messages: [] },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000 }])]: {
            success: true,
            result: { messages: [] },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000, maxChars: 500000 }])]: {
            success: true,
            result: { messages: [] },
          },
        },
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 12345, gatewayReady: true },
            },
          },
          [stableStringify(['/api/agents', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { success: true, agents: [{ id: 'main', name: 'Main' }] },
            },
          },
        },
      });

      // Queue deferred chat.send acks so the first response can arrive after
      // a second user turn has already started (stale-generation regression).
      await app.evaluate(({ }, sessionKey) => {
        const { ipcMain } = process.mainModule!.require('electron') as typeof import('electron');
        const globalProcess = process as NodeJS.Process & {
          __clawdockChatSendQueue?: Array<(value: { success: boolean; result?: { runId?: string }; error?: string }) => void>;
        };
        globalProcess.__clawdockChatSendQueue = [];

        const previous = ipcMain.listeners('gateway:rpc');
        void previous;
        ipcMain.removeHandler('gateway:rpc');
        ipcMain.handle('gateway:rpc', async (_event: unknown, method: string, payload: unknown) => {
          if (method === 'chat.send') {
            return await new Promise<{ success: boolean; result?: { runId?: string }; error?: string }>((resolve) => {
              globalProcess.__clawdockChatSendQueue!.push(resolve);
            });
          }
          if (method === 'chat.history') {
            return { success: true, result: { messages: [] } };
          }
          if (method === 'sessions.list') {
            return {
              success: true,
              result: {
                sessions: [{ key: sessionKey, displayName: 'main' }],
              },
            };
          }
          if (method === 'chat.abort') {
            return { success: true, result: {} };
          }
          return { success: true, result: payload ?? {} };
        });
      }, MAIN_SESSION_KEY);

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });

      // First send starts and stays pending at the RPC layer.
      await page.getByTestId('chat-composer-input').fill('first delayed send');
      await page.getByTestId('chat-composer-send').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/);

      // Simulate the first run finishing in the UI (history/media settle) while
      // its chat.send RPC is still in flight.
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('gateway:notification', {
          method: 'agent',
          params: {
            runId: 'run-first-stale',
            sessionKey: 'agent:main:main',
            data: { phase: 'completed' },
          },
        });
      });
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Send|发送)$/, {
        timeout: 15_000,
      });

      // Second send becomes the active generation.
      await page.getByTestId('chat-composer-input').fill('second active send');
      await page.getByTestId('chat-composer-send').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/);

      // Late first RPC success must not tear down the second run's UI.
      await app.evaluate(() => {
        const globalProcess = process as NodeJS.Process & {
          __clawdockChatSendQueue?: Array<(value: { success: boolean; result?: { runId?: string }; error?: string }) => void>;
        };
        const resolve = globalProcess.__clawdockChatSendQueue?.shift();
        resolve?.({ success: true, result: { runId: 'run-first-stale' } });
      });
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/);
      await expect(page.getByTestId('chat-run-error')).toHaveCount(0);

      // Completing the second run returns the composer to idle.
      await app.evaluate(() => {
        const globalProcess = process as NodeJS.Process & {
          __clawdockChatSendQueue?: Array<(value: { success: boolean; result?: { runId?: string }; error?: string }) => void>;
        };
        const resolve = globalProcess.__clawdockChatSendQueue?.shift();
        resolve?.({ success: true, result: { runId: 'run-second-active' } });
      });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('gateway:notification', {
          method: 'agent',
          params: {
            runId: 'run-second-active',
            sessionKey: 'agent:main:main',
            data: { phase: 'completed' },
          },
        });
      });
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Send|发送)$/, {
        timeout: 15_000,
      });
      await expect(page.getByTestId('chat-typing-indicator')).toHaveCount(0);
      await expect(page.getByTestId('chat-activity-indicator')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
