/**
 * ClawDock Kernel Entry Point
 * Assembles all components: WS Server, Session Manager, ReAct Engine, Tool Registry, Agent Loader
 */
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { KernelServer } from './server/ws-server.js';
import { SessionManager } from './engine/session-manager.js';
import { runReActLoop } from './engine/react-loop.js';
import { createDefaultToolRegistry } from './tools/index.js';
import { createProvider } from './providers/provider-factory.js';
import { loadAgentManifest, loadAgentOnDemand } from './agent/agent-loader.js';
import { SkillRegistry } from './skills/skill-loader.js';
import type { KernelEvent, KernelRequest, AIProviderConfig } from './types.js';

// Determine paths
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AGENTS_DIR = process.env.KERNEL_AGENTS_DIR || resolve(__dirname, '../agents');
const SKILLS_DIR = process.env.KERNEL_SKILLS_DIR || resolve(__dirname, '../skills');

// Global state
const sessions = new SessionManager();
const toolRegistry = createDefaultToolRegistry();
const skillRegistry = new SkillRegistry(SKILLS_DIR);
let providerConfig: AIProviderConfig | null = null;

async function main() {
  console.log('[Kernel] Starting ClawDock Independent Kernel...');

  // 加载 manifest.json 并预加载所有 Agent 配置到内存缓存
  try {
    const manifest = loadAgentManifest(AGENTS_DIR);
    console.log(`[Kernel] Manifest loaded: ${manifest.agents.length} agents available`);

    // 预加载所有 agent 配置（解密 + 缓存），使首次 session.create 变为缓存命中
    for (const agent of manifest.agents) {
      try {
        loadAgentOnDemand(agent.id, AGENTS_DIR);
      } catch (err) {
        console.error(`[Kernel] Pre-load agent '${agent.id}' failed:`, err);
      }
    }
    console.log(`[Kernel] All agent configs pre-loaded into cache`);
  } catch (err) {
    console.error('[Kernel] Failed to load manifest:', err);
  }

  // Create and start WebSocket server
  const server = new KernelServer({
    onConnect: () => {
      console.log('[Kernel] Ready for requests');
    },
    onRequest: handleRequest,
    onDisconnect: () => {
      console.log('[Kernel] Client disconnected, keeping alive for reconnect');
    },
  });

  const port = await server.start();

  // Print port so parent process can read it
  console.log(`KERNEL_PORT=${port}`);

  // Graceful shutdown
  process.on('SIGTERM', () => shutdown(server));
  process.on('SIGINT', () => shutdown(server));
}

function shutdown(server: KernelServer): void {
  console.log('[Kernel] Shutting down...');
  server.stop().then(() => {
    process.exit(0);
  });
}

async function* handleRequest(request: KernelRequest): AsyncGenerator<KernelEvent> {
  const req = request as Record<string, unknown>;

  switch (req.type) {
    case 'chat.send': {
      const sessionId = req.sessionId as string;
      const agentId = req.agentId as string;
      const message = req.message as string;
      const attachments = (req.attachments || []) as Array<{ fileName: string; stagedPath: string; mimeType: string; fileSize: number }>;
      const skillId = (req.skillId as string) || undefined;
      const permissionMode = req.permissionMode as string | undefined;

      yield* handleChatSend(sessionId, agentId, message, attachments, skillId, permissionMode as import('./types.js').PermissionMode | undefined);
      break;
    }

    case 'session.create': {
      const agentId = req.agentId as string;
      try {
        // 按需加载 Agent 配置（解密 + 缓存）
        const config = loadAgentOnDemand(agentId, AGENTS_DIR);
        const id = sessions.createSession(config);
        yield { type: 'session.created', sessionId: id };
      } catch (err) {
        yield { type: 'error', message: `Failed to load agent '${agentId}': ${(err as Error).message}` };
      }
      break;
    }

    case 'session.list': {
      yield { type: 'session.list', sessions: sessions.listSessions() };
      break;
    }

    case 'session.info': {
      const id = req.sessionId as string;
      const session = sessions.getSession(id);
      if (session) {
        yield { type: 'session.info', sessionId: id, workspaceRoot: session.workspaceRoot };
      } else {
        yield { type: 'error', message: `Session '${id}' not found` };
      }
      break;
    }

    case 'session.switch': {
      const id = req.sessionId as string;
      const ok = sessions.switchSession(id);
      if (!ok) {
        yield { type: 'error', message: `Session '${id}' not found` };
      }
      break;
    }

    case 'session.delete': {
      const id = req.sessionId as string;
      const ok = sessions.deleteSession(id);
      if (!ok) {
        yield { type: 'error', message: `Session '${id}' not found` };
      }
      break;
    }

    case 'session.restore': {
      const sid = req.sessionId as string;
      const aid = req.agentId as string;
      const histMessages = (req.messages || []) as Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; toolCallId?: string }>;

      try {
        // Load agent config (same as session.create)
        const config = loadAgentOnDemand(aid, AGENTS_DIR);

        // Create new session with this config
        const newId = sessions.createSession(config);

        // If a previous session with same ID exists, migrate workspace
        const existing = sessions.getSession(sid);
        if (existing) {
          // Delete old session but keep workspace
          sessions.deleteSession(sid);
        }

        // Write historical messages into the new session
        for (const m of histMessages) {
          if (m.role === 'tool' && m.toolCallId) {
            sessions.addMessage(newId, { role: 'tool', toolCallId: m.toolCallId, content: m.content });
          } else if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
            sessions.addMessage(newId, { role: m.role, content: m.content });
          }
        }

        console.log(`[Kernel] Session restored: ${newId} with ${histMessages.length} messages for agent ${aid}`);
        yield { type: 'session.restored', sessionId: newId, messageCount: histMessages.length };
      } catch (err) {
        yield { type: 'error', message: `Failed to restore session: ${(err as Error).message}` };
      }
      break;
    }

    case 'skill.list': {
      const skills = skillRegistry.list().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
      }));
      yield { type: 'skill.list', skills };
      break;
    }

    case 'skill.detail': {
      const skillId = req.skillId as string;
      const skill = skillRegistry.get(skillId);
      if (skill) {
        yield {
          type: 'skill.detail',
          skill: {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            category: skill.category,
            content: skill.content,
          },
        };
      } else {
        yield { type: 'error', message: `Skill '${skillId}' not found` };
      }
      break;
    }

    case 'approval.respond': {
      const reqId = req.requestId as string;
      const approved = req.approved as boolean;
      const autoApprove = req.autoApprove as boolean | undefined;
      const result = sessions.resolveApproval(reqId, approved);
      if (autoApprove && result.ok && result.tool && result.sessionId) {
        sessions.autoApproveTool(result.sessionId, result.tool);
        console.log(`[Kernel] Auto-approved tool '${result.tool}' for session '${result.sessionId}'`);
      }
      if (!result.ok) {
        yield { type: 'error', message: `Approval request '${reqId}' not found or already resolved` };
      }
      break;
    }

    case 'kernel.shutdown': {
      yield { type: 'error', message: 'Shutting down...' };
      process.exit(0);
    }

    case 'kernel.updateConfig': {
      // Runtime hot-update of provider config (no restart needed)
      if (req.apiKey) {
        process.env.ANTHROPIC_API_KEY = req.apiKey as string;
        process.env.KERNEL_API_KEY = req.apiKey as string;
      }
      if (req.openaiApiKey) {
        process.env.OPENAI_API_KEY = req.openaiApiKey as string;
        process.env.KERNEL_API_KEY = req.openaiApiKey as string;
      }
      if (req.model) process.env.KERNEL_MODEL = req.model as string;
      if (req.baseUrl) process.env.KERNEL_BASE_URL = req.baseUrl as string;
      if (req.api) process.env.KERNEL_API_TYPE = req.api as string;
      console.log(`[Kernel] Config updated: model=${process.env.KERNEL_MODEL || 'unchanged'}, api=${process.env.KERNEL_API_TYPE || 'unchanged'}`);
      yield { type: 'config.updated' };
      break;
    }

    default:
      yield { type: 'error', message: `Unknown request type: ${req.type}` };
  }
}

async function* handleChatSend(
  sessionId: string,
  agentId: string,
  message: string,
  attachments?: Array<{ fileName: string; stagedPath: string; mimeType: string; fileSize: number }>,
  skillId?: string,
  permissionMode?: import('./types.js').PermissionMode,
): AsyncGenerator<KernelEvent> {
  console.log(`[DEBUG handleChatSend] START sessionId=${sessionId}, agentId=${agentId}, msgLen=${message.length}`);

  const session = sessions.getSession(sessionId);
  if (!session) {
    console.log(`[DEBUG handleChatSend] Session not found: ${sessionId}`);
    yield { type: 'error', sessionId, message: `Session '${sessionId}' not found` };
    return;
  }
  console.log(`[DEBUG handleChatSend] Session found, messages=${session.messages.length}`);

  const agentConfig = session.agentConfig;

  // Runtime override: apply permission mode from UI if provided
  if (permissionMode) {
    session.agentConfig = { ...session.agentConfig, permissionMode };
    console.log(`[Kernel] Permission mode overridden to '${permissionMode}' for session '${sessionId}'`);
  }

  // Build provider config from agent settings + environment
  // Priority: KERNEL_* env vars (injected by launcher) > provider-specific env vars > agent config > defaults
  const apiKey = process.env.KERNEL_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
  providerConfig = {
    apiKey,
    baseUrl: process.env.KERNEL_BASE_URL || '',
    model: process.env.KERNEL_MODEL || agentConfig.model || 'claude-sonnet-4-6',
    temperature: agentConfig.temperature ?? 0.7,
    api: (process.env.KERNEL_API_TYPE as 'anthropic' | 'openai' | undefined) || undefined,
  };
  console.log(`[DEBUG handleChatSend] Provider config: model=${providerConfig.model}, baseUrl=${providerConfig.baseUrl}, apiKeyPrefix=${providerConfig.apiKey.slice(0, 8)}...`);

  if (!providerConfig.apiKey) {
    console.log(`[DEBUG handleChatSend] ERROR: No API key`);
    yield {
      type: 'error',
      sessionId,
      message: 'No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
    };
    return;
  }

  console.log(`[DEBUG handleChatSend] Creating provider...`);
  const provider = createProvider(providerConfig);
  console.log(`[DEBUG handleChatSend] Provider created`);

  // Add user message
  sessions.addMessage(sessionId, { role: 'user', content: message });
  console.log(`[DEBUG handleChatSend] User message added`);

  // Look up skill content if skillId provided (manual selection)
  const skillContent = skillId ? skillRegistry.get(skillId)?.content : undefined;
  if (skillId) {
    console.log(`[DEBUG handleChatSend] Skill '${skillId}' resolved: ${skillContent ? `${skillContent.length} chars` : 'NOT FOUND'}`);
  }

  // Always inject all skills metadata so the LLM can auto-select
  const allSkills = skillRegistry.list().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
  }));
  console.log(`[DEBUG handleChatSend] Injecting ${allSkills.length} skill metadata into system prompt`);

  // Run ReAct loop — pass session.messages directly so ReAct loop
  // pushes assistant/tool results into the live session history
  const messages = session.messages;
  console.log(`[DEBUG handleChatSend] Entering ReAct loop, messages=${messages.length}`);

  try {
    for await (const event of runReActLoop({
      provider,
      agentConfig,
      toolRegistry,
      sessionId,
      messages,
      workspaceRoot: session.workspaceRoot,
      isToolAutoApproved: (tool) => sessions.isToolAutoApproved(sessionId, tool),
      requestApproval: (requestId, tool, _input) => {
        return sessions.waitForApproval(requestId, tool, sessionId);
      },
      attachments,
      skillContent,
      allSkills,
    })) {
      console.log(`[DEBUG handleChatSend] ReAct yielded event: ${event.type}`);
      yield event;
    }
    console.log(`[DEBUG handleChatSend] ReAct loop completed normally`);
  } catch (err) {
    console.error(`[DEBUG handleChatSend] ReAct loop ERROR:`, err);
    yield {
      type: 'error',
      sessionId,
      message: `ReAct loop error: ${(err as Error).message}`,
    };
  }

  console.log(`[DEBUG handleChatSend] END`);
}

main().catch((err) => {
  console.error('[Kernel] Fatal error:', err);
  process.exit(1);
});
