/**
 * Session Manager - Manages conversation sessions
 * Handles session lifecycle, message history, and automatic compaction
 */
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import type { AgentConfig, Message, SessionInfo, TokenUsage } from '../types.js';

interface Session {
  id: string;
  agentId: string;
  agentConfig: AgentConfig;
  messages: Message[];
  workspaceRoot: string;
  createdAt: number;
  updatedAt: number;
  totalTokens: number;
  active: boolean;
}

const COMPACTION_THRESHOLD = 80000; // Trigger compaction at 80K tokens
const MAX_MESSAGES_BEFORE_COMPACT = 40;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private activeSessionId: string | null = null;
  private idCounter = 0;
  private approvalResolvers = new Map<string, (approved: boolean) => void>();
  private approvalTimeouts = new Map<string, NodeJS.Timeout>();

  createSession(agentConfig: AgentConfig): string {
    const id = `session_${Date.now()}_${++this.idCounter}`;
    const workspaceRoot = resolve(
      process.env.KERNEL_WORKSPACE_DIR || resolve(process.cwd(), 'workspace'),
      agentConfig.id,
      id
    );

    // Ensure workspace directory exists
    try {
      mkdirSync(workspaceRoot, { recursive: true });
      mkdirSync(resolve(workspaceRoot, 'memory'), { recursive: true });
      mkdirSync(resolve(workspaceRoot, 'uploads'), { recursive: true });
      mkdirSync(resolve(workspaceRoot, 'output'), { recursive: true });
    } catch (err) {
      console.error(`[SessionManager] Failed to create workspace: ${(err as Error).message}`);
    }

    const session: Session = {
      id,
      agentId: agentConfig.id,
      agentConfig,
      messages: [],
      workspaceRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalTokens: 0,
      active: true,
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;
    return id;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  switchSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.activeSessionId = id;
    return true;
  }

  deleteSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    return true;
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      agentId: s.agentId,
      agentName: s.agentConfig.identity.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
    }));
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages.push(message);
    session.updatedAt = Date.now();
  }

  getMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.messages] : [];
  }

  updateTokenUsage(sessionId: string, usage: TokenUsage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.totalTokens += usage.totalTokens;
  }

  /**
   * Check if compaction is needed and compact if so
   * Compaction strategy: Keep system prompt + last 20 messages
   */
  async compactIfNeeded(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (
      session.totalTokens < COMPACTION_THRESHOLD &&
      session.messages.length < MAX_MESSAGES_BEFORE_COMPACT
    ) {
      return false;
    }

    // Simple compaction: keep last 20 messages
    const systemMessages = session.messages.filter((m) => m.role === 'system');
    const recentMessages = session.messages.slice(-20);
    session.messages = [...systemMessages, ...recentMessages];
    session.totalTokens = 0; // Reset, will be recalculated

    return true;
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Wait for a user approval response.
   * Returns a Promise that resolves when the user approves/denies or times out.
   */
  waitForApproval(requestId: string, timeoutMs = 300_000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.approvalResolvers.delete(requestId);
        this.approvalTimeouts.delete(requestId);
        resolve(false); // timeout = denied
      }, timeoutMs);

      this.approvalResolvers.set(requestId, (approved: boolean) => {
        clearTimeout(timeout);
        this.approvalResolvers.delete(requestId);
        this.approvalTimeouts.delete(requestId);
        resolve(approved);
      });
    });
  }

  /**
   * Resolve a pending approval request.
   */
  resolveApproval(requestId: string, approved: boolean): boolean {
    const resolver = this.approvalResolvers.get(requestId);
    if (!resolver) return false;
    resolver(approved);
    return true;
  }
}
