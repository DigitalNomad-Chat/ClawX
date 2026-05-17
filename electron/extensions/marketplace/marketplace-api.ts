/**
 * Marketplace API - Backend routes for Agent marketplace
 * Provides IPC endpoints for the frontend to browse and select agents
 */
import { ipcMain, type WebContents, app } from 'electron';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getKernelLauncher } from '../index.js';
import { registerKernelLLMRoutes } from './kernel-llm-store.js';

function getManifestPath(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    // __dirname = dist-electron/main/ → project root
    return resolve(__dirname, '../../kernel/agents/manifest.json');
  }
  return resolve(process.resourcesPath!, 'kernel/agents/manifest.json');
}

function readManifest(): { agents: MarketplaceAgent[] } {
  const path = getManifestPath();
  const data = readFileSync(path, 'utf8');
  return JSON.parse(data);
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version: string;
  department?: string;
}

/** Per-webContents subscription state */
interface WcSubscription {
  unsubscribe: () => void;
  sessionIds: Set<string>;
}

/** Map: webContents.id -> subscription state */
const subscriptions = new Map<number, WcSubscription>();

/** Track destroyed webContents for cleanup */
const wcDestroyedHandlers = new WeakMap<WebContents, () => void>();

export function registerMarketplaceRoutes(): void {
  console.log('[Marketplace] Registering IPC routes...');

  // List all available agents — 直接读取 manifest.json，不经过内核
  ipcMain.handle('marketplace:listAgents', async () => {
    try {
      const manifest = readManifest();
      return { success: true, agents: manifest.agents };
    } catch (err) {
      console.error('[Marketplace] listAgents error:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Get agent detail — 直接读取 manifest.json，不经过内核
  ipcMain.handle('marketplace:getAgent', async (_event, agentId: string) => {
    try {
      const manifest = readManifest();
      const agent = manifest.agents.find((a) => a.id === agentId);
      if (agent) {
        return { success: true, agent };
      }
      return { success: false, error: `Agent '${agentId}' not found` };
    } catch (err) {
      console.error('[Marketplace] getAgent error:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Hire/activate an agent (create session)
  ipcMain.handle('marketplace:hireAgent', async (_event, agentId: string) => {
    try {
      const launcher = getKernelLauncher();
      if (!launcher) {
        return { success: false, error: 'Kernel launcher not initialized' };
      }

      if (!launcher.isRunning()) {
        await launcher.start();
      }

      const events = await launcher.sendRequest(
        { type: 'session.create', agentId } as Record<string, unknown>,
        30000
      );

      const createdEvent = events.find((e: Record<string, unknown>) => e.type === 'session.created');
      if (createdEvent) {
        return {
          success: true,
          sessionId: (createdEvent as Record<string, unknown>).sessionId,
        };
      }

      const errorEvent = events.find((e: Record<string, unknown>) => e.type === 'error');
      if (errorEvent) {
        return { success: false, error: (errorEvent as Record<string, unknown>).message };
      }

      return { success: false, error: 'No response from kernel' };
    } catch (err) {
      console.error('[Marketplace] hireAgent error:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Send a chat message to the kernel
  ipcMain.handle('kernel:chat', async (_event, sessionId: string, agentId: string, message: string) => {
    try {
      const launcher = getKernelLauncher();
      if (!launcher) {
        return { success: false, error: 'Kernel launcher not initialized' };
      }

      if (!launcher.isRunning()) {
        await launcher.start();
      }

      await launcher.sendStream({ type: 'chat.send', sessionId, agentId, message } as Record<string, unknown>);
      return { success: true };
    } catch (err) {
      console.error('[Marketplace] chat error:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Subscribe to kernel events for a session
  ipcMain.handle('kernel:subscribe', async (event, sessionId: string) => {
    const launcher = getKernelLauncher();
    if (!launcher) return { success: false, error: 'Kernel not available' };

    const wc = event.sender;
    const wcId = wc.id;

    let sub = subscriptions.get(wcId);
    if (!sub) {
      // First subscription for this webContents — register global listener
      const unsubscribe = launcher.subscribe((kernelEvent: Record<string, unknown>) => {
        const evSessionId = kernelEvent.sessionId as string | undefined;
        const evType = kernelEvent.type as string;
        console.log(`[Marketplace] Kernel event: type=${evType}, sessionId=${evSessionId}, forwarding=${!evSessionId || sub?.sessionIds.has(evSessionId) || evType === 'error'}`);

        // Forward if: event has no session (global), or matches an active session, or is an error
        if (!evSessionId || sub?.sessionIds.has(evSessionId) || evType === 'error') {
          // Safety: don't send to destroyed webContents
          if (!wc.isDestroyed()) {
            wc.send('kernel:event', kernelEvent);
            console.log(`[Marketplace] Sent kernel:event to wc ${wcId}`);
          } else {
            console.log(`[Marketplace] webContents ${wcId} destroyed, skipping event`);
          }
        }
      });

      sub = { unsubscribe, sessionIds: new Set() };
      subscriptions.set(wcId, sub);

      // Auto-cleanup when webContents is destroyed
      const onDestroyed = () => {
        console.log(`[Marketplace] webContents ${wcId} destroyed — cleaning up subscriptions`);
        sub?.unsubscribe();
        subscriptions.delete(wcId);
      };
      wcDestroyedHandlers.set(wc, onDestroyed);
      wc.once('destroyed', onDestroyed);
    }

    sub.sessionIds.add(sessionId);
    console.log(`[Marketplace] Subscribed webContents ${wcId} to session ${sessionId}. Active sessions: [${[...sub.sessionIds].join(', ')}]`);

    return { success: true };
  });

  // Unsubscribe from kernel events (all or specific session)
  ipcMain.handle('kernel:unsubscribe', async (event, sessionId?: string) => {
    const wcId = event.sender.id;
    const sub = subscriptions.get(wcId);
    if (!sub) return { success: true };

    if (sessionId) {
      sub.sessionIds.delete(sessionId);
      console.log(`[Marketplace] Unsubscribed webContents ${wcId} from session ${sessionId}`);

      // If no more sessions, fully unsubscribe
      if (sub.sessionIds.size === 0) {
        sub.unsubscribe();
        subscriptions.delete(wcId);
      }
    } else {
      // Unsubscribe all
      sub.unsubscribe();
      subscriptions.delete(wcId);
      console.log(`[Marketplace] Fully unsubscribed webContents ${wcId}`);
    }

    return { success: true };
  });

  // Respond to an approval request (from the ReAct permission checker)
  ipcMain.handle('kernel:approvalRespond', async (_event, requestId: string, approved: boolean) => {
    try {
      const launcher = getKernelLauncher();
      if (!launcher) {
        return { success: false, error: 'Kernel launcher not initialized' };
      }

      if (!launcher.isRunning()) {
        await launcher.start();
      }

      await launcher.sendStream({ type: 'approval.respond', requestId, approved } as Record<string, unknown>);
      return { success: true };
    } catch (err) {
      console.error('[Marketplace] approvalRespond error:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Register independent kernel LLM config routes
  registerKernelLLMRoutes();
}
