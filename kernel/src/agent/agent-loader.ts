/**
 * Agent Loader - Loads and decrypts encrypted Agent packages
 * Agent configs are stored encrypted on disk and decrypted into memory only
 */
import { createDecipheriv, randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AgentConfig, AgentIdentity, AgentManifest, AgentManifestEntry, AgentPackage } from '../types.js';

const ALGORITHM = 'aes-256-gcm';

/**
 * Decrypt an Agent package using AES-256-GCM
 * The key is derived from a device-bound secret + env var
 */
export function decryptAgentPackage(pkg: AgentPackage, key: Buffer): AgentConfig {
  const decipher = createDecipheriv(ALGORITHM, key, pkg.iv);
  decipher.setAuthTag(pkg.authTag);

  const decrypted = Buffer.concat([
    decipher.update(pkg.encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Load an encrypted Agent package from disk
 */
export function loadAgentPackage(agentId: string, agentsDir: string): AgentPackage {
  const pkgPath = join(agentsDir, `${agentId}.enc`);
  const data = readFileSync(pkgPath);

  // Format: [iv(12)][authTag(16)][encrypted...]
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);

  return { encrypted, iv, authTag };
}

/**
 * Load the Agent manifest (public, unencrypted)
 */
export function loadAgentManifest(agentsDir: string): AgentManifest {
  const manifestPath = join(agentsDir, 'manifest.json');
  const data = readFileSync(manifestPath, 'utf8');
  return JSON.parse(data);
}

/**
 * Derive the decryption key from environment
 * In production, this should use a device-bound secret
 */
export function deriveKey(): Buffer {
  const envKey = process.env.CLAWDOCK_KERNEL_KEY;
  if (envKey) {
    return Buffer.from(envKey.padEnd(32, '0').slice(0, 32));
  }
  // Fallback: derive from machine ID (not secure for production)
  // In production, use electron-store or OS keychain to store a real key
  const machineId = process.env.MACHINE_ID || 'clawx-default-key-32bytes-long';
  return Buffer.from(machineId.padEnd(32, '0').slice(0, 32));
}

/**
 * Agent Config Cache (inspired by Hermes _agent_cache)
 * Stores decrypted AgentConfig in memory after first load.
 * Keyed by agentId — once loaded, subsequent requests reuse the cached config.
 */
class AgentCache {
  private cache = new Map<string, AgentConfig>();

  get(agentId: string): AgentConfig | undefined {
    return this.cache.get(agentId);
  }

  set(agentId: string, config: AgentConfig): void {
    this.cache.set(agentId, config);
  }

  has(agentId: string): boolean {
    return this.cache.has(agentId);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Singleton agent config cache */
export const agentCache = new AgentCache();

/**
 * Load a single agent config on-demand (decrypt + cache).
 * Returns cached config if already loaded.
 * Throws if agentId not found in manifest or decryption fails.
 */
export function loadAgentOnDemand(agentId: string, agentsDir: string, customAgentsDir?: string): AgentConfig {
  // 缓存命中直接返回
  const cached = agentCache.get(agentId);
  if (cached) {
    console.log(`[Kernel] Agent '${agentId}' served from cache`);
    return cached;
  }

  // 优先加载自定义明文 Agent
  if (customAgentsDir && existsSync(join(customAgentsDir, agentId))) {
    const config = loadPlaintextAgent(agentId, join(customAgentsDir, agentId));
    agentCache.set(agentId, config);
    console.log(`[Kernel] Custom plaintext agent '${agentId}' loaded and cached`);
    return config;
  }

  // Fallback to builtin manifest validation + encrypted loading
  const manifest = loadAgentManifest(agentsDir);
  const entry = manifest.agents.find(a => a.id === agentId);
  if (!entry) {
    throw new Error(`Agent '${agentId}' not found in manifest`);
  }

  // 解密加载
  const key = deriveKey();
  const pkg = loadAgentPackage(agentId, agentsDir);
  const config = decryptAgentPackage(pkg, key);

  // 写入缓存
  agentCache.set(agentId, config);
  console.log(`[Kernel] Agent '${agentId}' loaded and cached (${agentCache.size} agents in cache)`);

  return config;
}

/**
 * Load a plaintext custom agent from an OpenClaw-style directory.
 */
export function loadPlaintextAgent(agentId: string, agentDir: string): AgentConfig {
  const identityPath = join(agentDir, 'IDENTITY.md');
  const soulPath = join(agentDir, 'SOUL.md');
  const agentsPath = join(agentDir, 'AGENTS.md');
  const toolsPath = join(agentDir, 'TOOLS.md');
  const userPath = join(agentDir, 'USER.md');
  const memoryPath = join(agentDir, 'MEMORY.md');
  const heartbeatPath = join(agentDir, 'heartbeat.md');

  if (!existsSync(identityPath) || !existsSync(soulPath)) {
    throw new Error(`Plaintext agent '${agentId}' missing IDENTITY.md or SOUL.md`);
  }

  const identity = parseIdentityMarkdown(readFileSync(identityPath, 'utf8'));
  let soul = readFileSync(soulPath, 'utf8');
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  const tools = existsSync(toolsPath) ? readFileSync(toolsPath, 'utf8') : '';
  const user = existsSync(userPath) ? readFileSync(userPath, 'utf8') : undefined;
  const memory = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf8') : undefined;
  const heartbeat = existsSync(heartbeatPath) ? readFileSync(heartbeatPath, 'utf8') : undefined;

  if (memory) {
    soul = `${soul}\n\n<!-- LONG_TERM_MEMORY -->\n${memory}`;
  }

  return {
    id: agentId,
    version: '1.0.0',
    identity,
    soul,
    agents,
    tools,
    user,
    heartbeat,
    maxTurns: 64,
  };
}

function parseIdentityMarkdown(content: string): AgentIdentity {
  const lines = content.split('\n');
  const result: Partial<AgentIdentity> = {
    name: '',
    nickname: '',
    emoji: '🤖',
    creature: '',
    vibe: '',
  };

  for (const line of lines) {
    const match = line.match(/^-\s*\*\*(.+?):\*\*\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (key === 'name') {
      const parts = value.split('/').map(s => s.trim());
      result.name = parts[0] || '';
      result.nickname = parts[1] || result.name;
    } else if (key === 'emoji') {
      result.emoji = value;
    } else if (key === 'creature') {
      result.creature = value;
    } else if (key === 'vibe') {
      result.vibe = value;
    }
  }

  return result as AgentIdentity;
}
