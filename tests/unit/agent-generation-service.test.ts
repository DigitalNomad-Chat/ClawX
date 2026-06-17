import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateAgentProfile } from '@electron/extensions/marketplace/agent-generation-service';

// Mock kernel LLM store
const mockStreamMessage = vi.fn();
vi.mock('@electron/extensions/marketplace/kernel-llm-store', () => ({
  getActiveLLMProvider: vi.fn(),
}));

vi.mock('@electron/../kernel/src/providers/provider-factory', () => ({
  createProvider: vi.fn(() => ({ streamMessage: mockStreamMessage })),
}));

import { getActiveLLMProvider } from '@electron/extensions/marketplace/kernel-llm-store';

describe('agent-generation-service', () => {
  beforeEach(() => {
    vi.mocked(getActiveLLMProvider).mockResolvedValue({
      id: 'test',
      name: 'Test',
      api: 'openai',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'test-key',
      models: ['gpt-4'],
      enabled: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no active LLM provider', async () => {
    vi.mocked(getActiveLLMProvider).mockResolvedValue(null);
    await expect(generateAgentProfile('需求')).rejects.toThrow('未配置 AI 模型');
  });

  it('returns parsed profile from LLM response', async () => {
    mockStreamMessage.mockImplementation(async function* () {
      yield { type: 'text_delta', text: JSON.stringify({
        id: 'frontend-reviewer',
        name: '前端架构师',
        nickname: '架构师',
        emoji: '🏗️',
        creature: '资深前端代码审查专家',
        vibe: '专业、耐心、细致',
        description: '帮你审查前端代码架构和可维护性。',
        tags: ['工程'],
        scenarios: ['组件设计审查', '重构建议'],
        soul: '你是资深前端架构师，擅长发现代码中的设计问题。',
      })};
      yield { type: 'complete', usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 }, toolCalls: [] };
    });

    const result = await generateAgentProfile('帮我生成一个前端代码审查 Agent');
    expect(result.name).toBe('前端架构师');
    expect(result.tags).toEqual(['工程']);
    expect(result.scenarios).toEqual(['组件设计审查', '重构建议']);
    expect(result.soul).toContain('前端架构师');
  });

  it('strips markdown code fences from response', async () => {
    mockStreamMessage.mockImplementation(async function* () {
      yield { type: 'text_delta', text: '```json\n{"id":"test","name":"测试","nickname":"测","emoji":"🧪","creature":"测","vibe":"测","description":"测","tags":["通用"],"scenarios":["测"],"soul":"测"}\n```' };
      yield { type: 'complete', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, toolCalls: [] };
    });

    const result = await generateAgentProfile('需求');
    expect(result.name).toBe('测试');
  });

  it('throws when response is not valid JSON', async () => {
    mockStreamMessage.mockImplementation(async function* () {
      yield { type: 'text_delta', text: 'not json' };
      yield { type: 'complete', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, toolCalls: [] };
    });

    await expect(generateAgentProfile('需求')).rejects.toThrow('无法解析为 JSON');
  });
});
