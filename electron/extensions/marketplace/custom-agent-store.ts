/**
 * Custom Agent Store - 用户自定义 Agent 的明文 markdown 存储
 * 路径：~/.clawdock/custom-agents/
 */
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { getClawDockConfigDir } from '../../utils/paths.js';
import type { AgentManifestEntry } from '../../../kernel/src/types.js';

export interface CustomAgentInput {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  soul: string;
  agents?: string;
  tools?: string;
  user?: string;
  memory?: string;
  heartbeat?: string;
  maxTurns?: number;
}

// 测试隔离辅助函数：允许测试覆盖自定义 Agent 根目录
let _customAgentsRootOverride: string | null = null;

export function setCustomAgentsRootForTest(root: string | null): void {
  _customAgentsRootOverride = root;
}

function getCustomAgentsDir(): string {
  const dir = _customAgentsRootOverride
    ? resolve(_customAgentsRootOverride, 'custom-agents')
    : resolve(getClawDockConfigDir(), 'custom-agents');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getRegistryPath(): string {
  return resolve(getCustomAgentsDir(), 'manifest.json');
}

function readRegistry(): { version: string; agents: AgentManifestEntry[] } {
  const path = getRegistryPath();
  if (!existsSync(path)) return { version: '1.0.0', agents: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeRegistry(registry: { version: string; agents: AgentManifestEntry[] }): void {
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf8');
}

export function listCustomAgents(): AgentManifestEntry[] {
  return readRegistry().agents;
}

export function ensureIdPrefix(id: string): string {
  const prefixed = id.startsWith('custom-') ? id : `custom-${id}`;
  return normalizeAgentId(prefixed);
}

function normalizeAgentId(id: string): string {
  const slug = id
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || /^\d+$/.test(slug)) return 'custom-agent';
  return slug;
}

export async function addCustomAgent(input: CustomAgentInput): Promise<AgentManifestEntry> {
  const id = ensureIdPrefix(input.id);
  const dir = resolve(getCustomAgentsDir(), id);
  mkdirSync(dir, { recursive: true });

  // Persist source markdown files (OpenClaw-style plaintext)
  writeFileSync(resolve(dir, 'IDENTITY.md'), buildIdentityMarkdown(input), 'utf8');
  writeFileSync(resolve(dir, 'SOUL.md'), input.soul, 'utf8');
  if (input.agents) writeFileSync(resolve(dir, 'AGENTS.md'), input.agents, 'utf8');
  if (input.tools) writeFileSync(resolve(dir, 'TOOLS.md'), input.tools, 'utf8');
  if (input.user) writeFileSync(resolve(dir, 'USER.md'), input.user, 'utf8');
  if (input.memory) writeFileSync(resolve(dir, 'MEMORY.md'), input.memory, 'utf8');
  if (input.heartbeat) writeFileSync(resolve(dir, 'heartbeat.md'), input.heartbeat, 'utf8');

  const entry: AgentManifestEntry = {
    id,
    name: input.name,
    nickname: input.nickname,
    emoji: input.emoji,
    creature: input.creature,
    vibe: input.vibe,
    description: input.description,
    tags: input.tags,
    scenarios: input.scenarios,
    version: '1.0.0',
  };

  const registry = readRegistry();
  registry.agents = registry.agents.filter(a => a.id !== id);
  registry.agents.push(entry);
  writeRegistry(registry);
  return entry;
}

export function deleteCustomAgent(id: string): void {
  const prefixed = ensureIdPrefix(id);
  const dir = resolve(getCustomAgentsDir(), prefixed);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  const registry = readRegistry();
  registry.agents = registry.agents.filter(a => a.id !== prefixed);
  writeRegistry(registry);
}

export async function updateCustomAgent(id: string, input: CustomAgentInput): Promise<AgentManifestEntry> {
  const prefixed = ensureIdPrefix(id);
  deleteCustomAgent(prefixed);
  return addCustomAgent({ ...input, id: prefixed });
}

function buildIdentityMarkdown(input: CustomAgentInput): string {
  return [
    `- **Name:** ${input.name} / ${input.nickname}`,
    `- **Emoji:** ${input.emoji}`,
    `- **Creature:** ${input.creature}`,
    `- **Vibe:** ${input.vibe}`,
    `- **Department:** ${input.tags[0] || '通用'}`,
  ].join('\n');
}
