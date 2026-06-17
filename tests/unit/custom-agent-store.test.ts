import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { rmSync, existsSync, readFileSync } from 'fs';
import {
  addCustomAgent,
  listCustomAgents,
  deleteCustomAgent,
  updateCustomAgent,
  setCustomAgentsRootForTest,
  ensureIdPrefix,
} from '../../electron/extensions/marketplace/custom-agent-store';

const testDir = resolve(__dirname, '../../test-output/custom-agents');

describe('custom-agent-store', () => {
  beforeAll(() => {
    setCustomAgentsRootForTest(testDir);
  });

  afterAll(() => {
    setCustomAgentsRootForTest(null);
    rmSync(testDir, { recursive: true, force: true });
  });

  it('adds and lists a custom agent', async () => {
    const agent = {
      id: 'custom-test-helper',
      name: '测试助手',
      nickname: '测试助手',
      emoji: '🧪',
      creature: '测试用 Agent',
      vibe: '友好',
      description: '仅用于测试',
      tags: ['专项'],
      scenarios: ['跑测试'],
      soul: '你是测试助手。',
      agents: '',
      tools: '',
    };
    await addCustomAgent(agent);
    const result = listCustomAgents();
    expect(result.some((a) => a.id === 'custom-test-helper')).toBe(true);
    expect(
      existsSync(resolve(testDir, 'custom-agents/custom-test-helper/SOUL.md'))
    ).toBe(true);
    expect(
      existsSync(
        resolve(testDir, 'custom-agents/custom-test-helper/IDENTITY.md')
      )
    ).toBe(true);
    deleteCustomAgent('custom-test-helper');
  });

  it('auto-prefixes id with custom-', async () => {
    const agent = {
      id: 'my-agent',
      name: '我的Agent',
      nickname: '小助',
      emoji: '🦀',
      creature: '测试',
      vibe: '活泼',
      description: '测试自动前缀',
      tags: ['测试'],
      scenarios: ['测试'],
      soul: '你是测试Agent。',
    };
    const entry = await addCustomAgent(agent);
    expect(entry.id).toBe('custom-my-agent');
    expect(listCustomAgents().some((a) => a.id === 'custom-my-agent')).toBe(
      true
    );
    deleteCustomAgent('my-agent');
  });

  it('persists optional markdown files only when non-empty', async () => {
    const agent = {
      id: 'opt-files',
      name: '可选文件测试',
      nickname: '测试',
      emoji: '📄',
      creature: '测试',
      vibe: '中性',
      description: '测试可选文件',
      tags: ['测试'],
      scenarios: ['测试'],
      soul: '测试。',
      agents: 'agents content',
      tools: 'tools content',
      user: 'user content',
      memory: 'memory content',
      heartbeat: 'heartbeat content',
    };
    await addCustomAgent(agent);
    const dir = resolve(testDir, 'custom-agents/custom-opt-files');
    expect(existsSync(resolve(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(dir, 'TOOLS.md'))).toBe(true);
    expect(existsSync(resolve(dir, 'USER.md'))).toBe(true);
    expect(existsSync(resolve(dir, 'MEMORY.md'))).toBe(true);
    expect(existsSync(resolve(dir, 'heartbeat.md'))).toBe(true);
    expect(readFileSync(resolve(dir, 'AGENTS.md'), 'utf8')).toBe(
      'agents content'
    );
    expect(readFileSync(resolve(dir, 'USER.md'), 'utf8')).toBe('user content');
    deleteCustomAgent('opt-files');
  });

  it('does not create optional files when empty', async () => {
    const agent = {
      id: 'no-opts',
      name: '无选项测试',
      nickname: '测试',
      emoji: '📄',
      creature: '测试',
      vibe: '中性',
      description: '测试无选项',
      tags: ['测试'],
      scenarios: ['测试'],
      soul: '测试。',
      agents: '',
      tools: '',
      user: '',
      memory: '',
      heartbeat: '',
    };
    await addCustomAgent(agent);
    const dir = resolve(testDir, 'custom-agents/custom-no-opts');
    expect(existsSync(resolve(dir, 'AGENTS.md'))).toBe(false);
    expect(existsSync(resolve(dir, 'TOOLS.md'))).toBe(false);
    expect(existsSync(resolve(dir, 'USER.md'))).toBe(false);
    expect(existsSync(resolve(dir, 'MEMORY.md'))).toBe(false);
    expect(existsSync(resolve(dir, 'heartbeat.md'))).toBe(false);
    deleteCustomAgent('no-opts');
  });

  it('updates an existing agent', async () => {
    const agent = {
      id: 'update-test',
      name: '更新前',
      nickname: '旧昵称',
      emoji: '🔧',
      creature: '测试',
      vibe: '旧风格',
      description: '旧描述',
      tags: ['旧'],
      scenarios: ['旧场景'],
      soul: '旧 soul。',
    };
    await addCustomAgent(agent);

    const updated = {
      ...agent,
      name: '更新后',
      nickname: '新昵称',
      vibe: '新风格',
      description: '新描述',
      soul: '新 soul。',
    };
    const entry = await updateCustomAgent('update-test', updated);
    expect(entry.name).toBe('更新后');
    expect(entry.nickname).toBe('新昵称');

    const list = listCustomAgents();
    const found = list.find((a) => a.id === 'custom-update-test');
    expect(found).toBeDefined();
    expect(found!.name).toBe('更新后');

    const dir = resolve(testDir, 'custom-agents/custom-update-test');
    expect(readFileSync(resolve(dir, 'SOUL.md'), 'utf8')).toBe('新 soul。');

    deleteCustomAgent('update-test');
  });

  it('deletes agent and removes from registry', async () => {
    const agent = {
      id: 'delete-test',
      name: '删除测试',
      nickname: '测试',
      emoji: '🗑️',
      creature: '测试',
      vibe: '中性',
      description: '测试删除',
      tags: ['测试'],
      scenarios: ['测试'],
      soul: '测试。',
    };
    await addCustomAgent(agent);
    expect(listCustomAgents().some((a) => a.id === 'custom-delete-test')).toBe(
      true
    );

    deleteCustomAgent('delete-test');
    expect(
      listCustomAgents().some((a) => a.id === 'custom-delete-test')
    ).toBe(false);
    expect(
      existsSync(resolve(testDir, 'custom-agents/custom-delete-test'))
    ).toBe(false);
  });

  it('builds IDENTITY.md in correct format', async () => {
    const agent = {
      id: 'identity-test',
      name: '身份测试',
      nickname: '小助',
      emoji: '🆔',
      creature: '身份测试Agent',
      vibe: '严谨',
      description: '测试 IDENTITY.md',
      tags: ['身份'],
      scenarios: ['测试'],
      soul: '测试。',
    };
    await addCustomAgent(agent);
    const dir = resolve(testDir, 'custom-agents/custom-identity-test');
    const identity = readFileSync(resolve(dir, 'IDENTITY.md'), 'utf8');
    expect(identity).toContain('- **Name:** 身份测试 / 小助');
    expect(identity).toContain('- **Emoji:** 🆔');
    expect(identity).toContain('- **Creature:** 身份测试Agent');
    expect(identity).toContain('- **Vibe:** 严谨');
    expect(identity).toContain('- **Department:** 身份');
    deleteCustomAgent('identity-test');
  });

  it('ensureIdPrefix works correctly', () => {
    expect(ensureIdPrefix('custom-foo')).toBe('custom-foo');
    expect(ensureIdPrefix('foo')).toBe('custom-foo');
    expect(ensureIdPrefix('custom-custom-foo')).toBe('custom-custom-foo');
  });
});
