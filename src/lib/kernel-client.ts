/**
 * Kernel Client - Frontend interface to the independent kernel
 * Communicates with the kernel through Electron IPC bridge
 */

export interface KernelEvent {
  type: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface AgentInfo {
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
}

export interface SessionInfo {
  id: string;
  agentId: string;
  agentName: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

type EventCallback = (event: KernelEvent) => void;

class KernelClient {
  private subscribers = new Map<string, Set<EventCallback>>();
  private globalSubscribers = new Set<EventCallback>();
  private ipcListener: ((...args: unknown[]) => void) | null = null;
  private ipcActive = false;

  /**
   * List all available agents in the marketplace
   */
  async listAgents(): Promise<{ success: boolean; agents?: AgentInfo[]; error?: string }> {
    return window.electron.ipcRenderer.invoke('marketplace:listAgents') as Promise<{
      success: boolean;
      agents?: AgentInfo[];
      error?: string;
    }>;
  }

  /**
   * Get details of a specific agent
   */
  async getAgent(agentId: string): Promise<{ success: boolean; agent?: AgentInfo; error?: string }> {
    return window.electron.ipcRenderer.invoke('marketplace:getAgent', agentId) as Promise<{
      success: boolean;
      agent?: AgentInfo;
      error?: string;
    }>;
  }

  /**
   * Hire/activate an agent (creates a session)
   */
  async hireAgent(agentId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    return window.electron.ipcRenderer.invoke('marketplace:hireAgent', agentId) as Promise<{
      success: boolean;
      sessionId?: string;
      error?: string;
    }>;
  }

  /**
   * Send a chat message to an agent
   */
  async sendChat(sessionId: string, agentId: string, message: string): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke('kernel:chat', sessionId, agentId, message) as Promise<{
      success: boolean;
      error?: string;
    }>;
  }

  /**
   * Subscribe to kernel events for a session
   * Events (delta.text, tool.started, etc.) will be forwarded to callbacks
   * Returns an unsubscribe function that precisely removes only this callback.
   */
  async subscribeToSession(sessionId: string, callback: EventCallback): Promise<() => void> {
    // Register callback under this session
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(callback);

    // Set up IPC listener once
    if (!this.ipcActive) {
      this.ipcListener = (...args: unknown[]) => {
        const event = args[0] as KernelEvent;
        const evSessionId = event.sessionId;
        console.log('[KernelClient] IPC event received:', event.type, 'sessionId=', evSessionId);

        // Dispatch to session-specific subscribers
        if (evSessionId) {
          const sessionCallbacks = this.subscribers.get(evSessionId);
          console.log('[KernelClient] Session subscribers for', evSessionId, ':', sessionCallbacks?.size ?? 0);
          if (sessionCallbacks) {
            for (const cb of sessionCallbacks) {
              try { cb(event); } catch (err) {
                console.error('[KernelClient] Session subscriber error:', err);
              }
            }
          }
        }

        // Dispatch to global subscribers (and error subscribers)
        for (const cb of this.globalSubscribers) {
          try { cb(event); } catch (err) {
            console.error('[KernelClient] Global subscriber error:', err);
          }
        }
      };

      window.electron.ipcRenderer.on('kernel:event', this.ipcListener);
      this.ipcActive = true;
      console.log('[KernelClient] IPC listener registered');
    }

    // Tell main process to forward events for this session
    await window.electron.ipcRenderer.invoke('kernel:subscribe', sessionId);

    // Return precise unsubscribe function
    return () => {
      this.unsubscribe(sessionId, callback).catch(() => {});
    };
  }

  /**
   * Unsubscribe from kernel events
   * @param sessionId - If provided, only unsubscribe this session. Otherwise unsubscribe all.
   * @param callback - If provided, only remove this specific callback for the session.
   */
  async unsubscribe(sessionId?: string, callback?: EventCallback): Promise<void> {
    if (sessionId) {
      const sessionCallbacks = this.subscribers.get(sessionId);
      if (sessionCallbacks) {
        if (callback) {
          sessionCallbacks.delete(callback);
          if (sessionCallbacks.size === 0) {
            this.subscribers.delete(sessionId);
          }
        } else {
          // No callback specified — remove all callbacks for this session
          this.subscribers.delete(sessionId);
        }
      }

      // Notify main process only if no callbacks remain for this session
      if (!this.subscribers.has(sessionId)) {
        try {
          await window.electron.ipcRenderer.invoke('kernel:unsubscribe', sessionId);
        } catch {
          // ignore
        }
      }

      // If no more sessions, tear down IPC listener
      if (this.subscribers.size === 0 && this.globalSubscribers.size === 0) {
        this.teardownIpc();
      }
      return;
    }

    // Unsubscribe all
    this.subscribers.clear();
    this.globalSubscribers.clear();
    this.teardownIpc();

    try {
      await window.electron.ipcRenderer.invoke('kernel:unsubscribe');
    } catch {
      // ignore
    }
  }

  /**
   * Add a global event subscriber (receives all events regardless of session)
   */
  onEvent(callback: EventCallback): () => void {
    this.globalSubscribers.add(callback);

    // Ensure IPC listener is active
    if (!this.ipcActive) {
      void this.subscribeToSession('_global_', () => {});
    }

    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  private teardownIpc(): void {
    if (this.ipcListener) {
      // off() without callback triggers removeAllListeners, ensuring
      // the internal subscription wrapper is actually removed.
      window.electron.ipcRenderer.off('kernel:event');
      this.ipcListener = null;
    }
    this.ipcActive = false;
  }
}

// Export singleton instance
export const kernelClient = new KernelClient();
