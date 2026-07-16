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
  // M4.1 regression lock: evidence scaffold (incl. review fixes for run-scoped
  // freshness / live-evidence hard gate) must not change phase=end non-terminal
  // stop-control semantics or happy-path history poll behavior.
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

      const sendButton = page.getByTestId('chat-composer-send');
      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill('run long task');
      await sendButton.click();
      await expect(sendButton).toHaveAttribute('title', /Stop|停止/);

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

      await expect(sendButton).toHaveAttribute('title', /Stop|停止/);

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

      await expect(sendButton).toHaveAttribute('title', /Send|发送/);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('drives active execution graph from mocked chat:runtime-event tool stream', async ({ launchElectronApp }) => {
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
            result: { runId: 'run-e2e-runtime' },
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

      const sendButton = page.getByTestId('chat-composer-send');
      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill('run with tools');
      await sendButton.click();
      await expect(sendButton).toHaveAttribute('title', /Stop|停止/);

      // Host-event mock: Main dual-emit channel (no real provider / Gateway required).
      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('chat:runtime-event', {
            type: 'tool.started',
            runId: 'run-e2e-runtime',
            sessionKey: 'agent:main:main',
            toolCallId: 'call-1',
            name: 'read',
            args: { filePath: '/tmp/demo.md' },
          });
        }
      });

      await expect(page.getByTestId('chat-execution-graph')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('read')).toBeVisible();

      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('chat:runtime-event', {
            type: 'tool.completed',
            runId: 'run-e2e-runtime',
            sessionKey: 'agent:main:main',
            toolCallId: 'call-1',
            name: 'read',
            result: { summary: 'done' },
            isError: false,
          });
        }
      });

      await expect(sendButton).toHaveAttribute('title', /Stop|停止/);

      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('chat:runtime-event', {
            type: 'run.ended',
            runId: 'run-e2e-runtime',
            sessionKey: 'agent:main:main',
            status: 'completed',
            endedAt: Date.now(),
          });
        }
      });

      await expect(sendButton).toHaveAttribute('title', /Send|发送/);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('settles unfinished command.output steps after runtime run.ended', async ({ launchElectronApp }) => {
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
            result: { runId: 'run-e2e-settle' },
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

      const sendButton = page.getByTestId('chat-composer-send');
      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill('run with command output');
      await sendButton.click();
      await expect(sendButton).toHaveAttribute('title', /Stop|停止/);

      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('chat:runtime-event', {
            type: 'tool.started',
            runId: 'run-e2e-settle',
            sessionKey: 'agent:main:main',
            toolCallId: 'call-exec',
            name: 'exec',
            args: { command: 'ls' },
          });
          win.webContents.send('chat:runtime-event', {
            type: 'command.output',
            runId: 'run-e2e-settle',
            sessionKey: 'agent:main:main',
            toolCallId: 'call-exec',
            itemId: 'cmd-open',
            title: 'exec output',
            output: 'partial log line',
            status: 'running',
            phase: 'update',
          });
        }
      });

      await expect(page.getByTestId('chat-execution-graph')).toBeVisible({ timeout: 15_000 });
      // message-kind steps show detail (not title) until expanded.
      await expect(page.getByText('partial log line')).toBeVisible();
      await expect(page.getByText('exec')).toBeVisible();

      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('chat:runtime-event', {
            type: 'tool.completed',
            runId: 'run-e2e-settle',
            sessionKey: 'agent:main:main',
            toolCallId: 'call-exec',
            name: 'exec',
            result: { summary: 'done' },
            isError: false,
          });
          win.webContents.send('chat:runtime-event', {
            type: 'run.ended',
            runId: 'run-e2e-settle',
            sessionKey: 'agent:main:main',
            status: 'completed',
            endedAt: Date.now(),
          });
        }
      });

      await expect(sendButton).toHaveAttribute('title', /Send|发送/);
      // After terminal settle, command.output must not stay "running".
      // Expand collapsed completed graph if needed; then expand the message
      // step so its status badge is rendered (narration hides status until expand).
      const graph = page.getByTestId('chat-execution-graph');
      if ((await graph.getAttribute('data-collapsed')) === 'true') {
        await graph.click();
      }
      const outputRow = page.locator('[data-testid="chat-execution-step"]').filter({ hasText: 'partial log line' }).first();
      await expect(outputRow).toBeVisible();
      await outputRow.locator('button').first().click();
      await expect(outputRow.getByText(/completed|已完成|完成/i)).toBeVisible({ timeout: 5_000 });
      await expect(outputRow.getByText(/running|运行中/i)).toHaveCount(0);
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

  test('preserves running state when creating a new chat and switching back', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    // Unique prompt becomes the sidebar session label for non-main sessions
    // (first user message), giving a stable user-visible locator for switch-back.
    const prompt = 'keep running while new chat';
    const seedHistory = [
      {
        role: 'user',
        id: 'seed-user',
        timestamp: Date.now() / 1000,
        content: 'seed conversation for new-chat guard',
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
            result: { messages: seedHistory },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 200, maxChars: 500000 }])]: {
            success: true,
            result: { messages: seedHistory },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000 }])]: {
            success: true,
            result: { messages: seedHistory },
          },
          [stableStringify(['chat.history', { sessionKey: MAIN_SESSION_KEY, limit: 1000, maxChars: 500000 }])]: {
            success: true,
            result: { messages: seedHistory },
          },
          // Default empty history for newly created local sessions.
          [stableStringify(['chat.history', null])]: {
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

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByText('seed conversation for new-chat guard')).toBeVisible({ timeout: 15_000 });

      // Leave main for a fresh non-main session so the first user prompt becomes
      // that session's sidebar label.
      await page.getByTestId('sidebar-new-chat').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Send|发送)$/, {
        timeout: 15_000,
      });

      // Keep this session's chat.send pending so the run stays active across
      // the next New Chat without #1094 runtime events.
      await app.evaluate(() => {
        const { ipcMain } = process.mainModule!.require('electron') as typeof import('electron');
        const globalProcess = process as NodeJS.Process & {
          __clawdockChatSendQueue?: Array<(value: { success: boolean; result?: { runId?: string }; error?: string }) => void>;
        };
        globalProcess.__clawdockChatSendQueue = [];
        ipcMain.removeHandler('gateway:rpc');
        ipcMain.handle('gateway:rpc', async (_event: unknown, method: string, payload: unknown) => {
          if (method === 'chat.send') {
            return await new Promise<{ success: boolean; result?: { runId?: string }; error?: string }>((resolve) => {
              globalProcess.__clawdockChatSendQueue!.push(resolve);
            });
          }
          if (method === 'chat.history') {
            const sessionKey = payload && typeof payload === 'object'
              ? String((payload as { sessionKey?: unknown }).sessionKey ?? '')
              : '';
            if (sessionKey === 'agent:main:main') {
              return {
                success: true,
                result: {
                  messages: [{
                    role: 'user',
                    id: 'seed-user',
                    timestamp: Date.now() / 1000,
                    content: 'seed conversation for new-chat guard',
                  }],
                },
              };
            }
            return { success: true, result: { messages: [] } };
          }
          if (method === 'sessions.list') {
            return {
              success: true,
              result: {
                sessions: [{ key: 'agent:main:main', displayName: 'main' }],
              },
            };
          }
          if (method === 'chat.abort') {
            return { success: true, result: {} };
          }
          return { success: true, result: {} };
        });
      });

      await page.getByTestId('chat-composer-input').fill(prompt);
      await page.getByTestId('chat-composer-send').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/);
      await expect(page.getByText(prompt).first()).toBeVisible();

      // Expand agent group so the labeled source session stays clickable.
      const agentGroup = page.getByTestId('agent-group-main');
      await expect(agentGroup).toBeVisible({ timeout: 10_000 });
      if ((await agentGroup.locator('[data-session-item]').count()) === 0) {
        await agentGroup.locator('button').first().click();
      }

      // New Chat parks the running labeled session and opens an idle one.
      await page.getByTestId('sidebar-new-chat').click();
      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Send|发送)$/, {
        timeout: 15_000,
      });

      if ((await agentGroup.locator('[data-session-item]').count()) === 0) {
        await agentGroup.locator('button').first().click();
      }

      // User-visible session label = first user prompt on the running session.
      await page
        .locator('[data-session-item]')
        .filter({ hasText: 'keep running' })
        .first()
        .click();

      await expect(page.getByTestId('chat-composer-send')).toHaveAttribute('title', /^(Stop|停止)$/, {
        timeout: 15_000,
      });
      await expect(page.getByTestId('chat-typing-indicator')).toHaveCount(0);
      await expect(page.getByTestId('chat-activity-indicator')).toHaveCount(0);
      await expect(page.getByText(prompt).first()).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
