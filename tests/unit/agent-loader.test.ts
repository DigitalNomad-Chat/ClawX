import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadAgentOnDemand, agentCache, loadPlaintextAgent } from '../../kernel/src/agent/agent-loader';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const testAgentsDir = resolve(__dirname, 'test-agents');
const testCustomDir = resolve(__dirname, 'test-custom-agents');

describe('loadAgentOnDemand with custom plaintext dir', () => {
  beforeAll(() => {
    agentCache.clear();
    rmSync(testAgentsDir, { recursive: true, force: true });
    rmSync(testCustomDir, { recursive: true, force: true });

    mkdirSync(testAgentsDir, { recursive: true });
    mkdirSync(testCustomDir, { recursive: true });

    mkdirSync(resolve(testCustomDir, 'custom-foo'), { recursive: true });
    writeFileSync(
      resolve(testCustomDir, 'custom-foo', 'IDENTITY.md'),
      '- **Name:** 自定义助手 / 小助\n- **Emoji:** 🦀\n- **Creature:** 测试用自定义 Agent\n- **Vibe:** 友好',
      'utf8',
    );
    writeFileSync(resolve(testCustomDir, 'custom-foo', 'SOUL.md'), '你是自定义测试助手。', 'utf8');
  });

  afterAll(() => {
    rmSync(testAgentsDir, { recursive: true, force: true });
    rmSync(testCustomDir, { recursive: true, force: true });
    agentCache.clear();
  });

  it('loads custom plaintext agent before builtin', () => {
    const config = loadAgentOnDemand('custom-foo', testAgentsDir, testCustomDir);
    expect(config.id).toBe('custom-foo');
    expect(config.soul).toContain('自定义测试助手');
  });

  it('loadPlaintextAgent reads markdown source', () => {
    const config = loadPlaintextAgent('custom-foo', resolve(testCustomDir, 'custom-foo'));
    expect(config.id).toBe('custom-foo');
    expect(config.identity.name).toBe('自定义助手');
    expect(config.identity.nickname).toBe('小助');
    expect(config.identity.emoji).toBe('🦀');
    expect(config.identity.creature).toBe('测试用自定义 Agent');
    expect(config.identity.vibe).toBe('友好');
    expect(config.maxTurns).toBe(64);
  });

  it('caches loaded custom agent', () => {
    agentCache.clear();
    const config1 = loadAgentOnDemand('custom-foo', testAgentsDir, testCustomDir);
    const config2 = loadAgentOnDemand('custom-foo', testAgentsDir, testCustomDir);
    expect(config1).toBe(config2);
  });
});

describe('loadPlaintextAgent with optional files', () => {
  const testDir = resolve(__dirname, 'test-custom-full');

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });

    const agentDir = resolve(testDir, 'custom-full');
    mkdirSync(agentDir, { recursive: true });

    writeFileSync(
      join(agentDir, 'IDENTITY.md'),
      '- **Name:** 完整测试 / 小测\n- **Emoji:** 🧪\n- **Creature:** 完整测试 Agent\n- **Vibe:** 严谨',
      'utf8',
    );
    writeFileSync(join(agentDir, 'SOUL.md'), '核心人格。', 'utf8');
    writeFileSync(join(agentDir, 'AGENTS.md'), '会话规则。', 'utf8');
    writeFileSync(join(agentDir, 'TOOLS.md'), '工具说明。', 'utf8');
    writeFileSync(join(agentDir, 'USER.md'), '用户画像。', 'utf8');
    writeFileSync(join(agentDir, 'MEMORY.md'), '长期记忆。', 'utf8');
    writeFileSync(join(agentDir, 'heartbeat.md'), '定时任务。', 'utf8');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reads all optional files', () => {
    const config = loadPlaintextAgent('custom-full', resolve(testDir, 'custom-full'));
    expect(config.agents).toBe('会话规则。');
    expect(config.tools).toBe('工具说明。');
    expect(config.user).toBe('用户画像。');
    expect(config.heartbeat).toBe('定时任务。');
  });

  it('appends memory to soul with marker', () => {
    const config = loadPlaintextAgent('custom-full', resolve(testDir, 'custom-full'));
    expect(config.soul).toContain('核心人格。');
    expect(config.soul).toContain('<!-- LONG_TERM_MEMORY -->');
    expect(config.soul).toContain('长期记忆。');
  });

  it('skips optional files when missing', () => {
    const minimalDir = resolve(testDir, 'custom-minimal');
    mkdirSync(minimalDir, { recursive: true });
    writeFileSync(
      join(minimalDir, 'IDENTITY.md'),
      '- **Name:** 最小测试 / 小最\n- **Emoji:** ⚡\n- **Creature:** 最小 Agent\n- **Vibe:** 简洁',
      'utf8',
    );
    writeFileSync(join(minimalDir, 'SOUL.md'), '最小人格。', 'utf8');

    const config = loadPlaintextAgent('custom-minimal', minimalDir);
    expect(config.agents).toBe('');
    expect(config.tools).toBe('');
    expect(config.user).toBeUndefined();
    expect(config.heartbeat).toBeUndefined();
    expect(config.soul).toBe('最小人格。');
  });
});
