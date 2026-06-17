/**
 * Agent Generation Service - 根据用户需求调用 LLM 生成 Agent 配置
 */
import { createProvider } from '../../../kernel/src/providers/provider-factory.js';
import { getActiveLLMProvider } from './kernel-llm-store.js';
import type { CustomAgentInput } from './custom-agent-store.js';

export interface GeneratedAgentProfile {
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
}

const SYSTEM_PROMPT = `你是一位资深的 Agent 设计师，擅长根据用户需求设计 OpenClaw 风格的 AI Agent。
请根据用户的简短需求描述，生成一份结构化的 Agent 配置。

输出必须严格为 JSON，字段如下：
- id: 英文唯一标识（小写、短横线连接）
- name: 中文名称
- nickname: 2-4 字昵称
- emoji: 一个符合身份的 emoji
- creature: 一句话定位（20 字以内）
- vibe: 风格关键词（如：专业、耐心、简洁）
- description: 100 字以内简介
- tags: 标签数组（1-2 个，从“工程、营销、设计、产品、商务、运营、专项、创意、管理、通用”中选取）
- scenarios: 擅长场景数组（3-5 个，每项 10 字以内）
- soul: SOUL.md 内容（核心人格、使命、原则，200-400 字）
- agents: AGENTS.md 内容（会话工作流、决策规则，可选）
- tools: TOOLS.md 内容（工具使用偏好，可选）
- user: USER.md 内容（目标用户画像，可选）
- memory: MEMORY.md 内容（应记住的关键信息，可选）

请确保 JSON 格式正确，可直接解析，不要包含 markdown 代码块。`;

export async function generateAgentProfile(requirements: string): Promise<GeneratedAgentProfile> {
  const active = await getActiveLLMProvider();
  if (!active) {
    throw new Error('未配置 AI 模型，请先在“模型设置”中配置并激活模型');
  }

  const provider = createProvider({
    apiKey: active.apiKey,
    baseUrl: active.baseUrl,
    model: active.model,
    api: active.api,
    temperature: 0.7,
    maxTokens: 8192,
  });

  const stream = provider.streamMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: requirements }],
  });

  let text = '';
  for await (const event of stream) {
    if (event.type === 'text_delta') {
      text += event.text;
    }
  }

  // 去除可能的 markdown 代码块包装
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: Partial<GeneratedAgentProfile>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回的内容无法解析为 JSON，请重试或简化需求');
  }

  if (!parsed.name || !parsed.soul) {
    throw new Error('AI 返回的 Agent 配置不完整，请重试');
  }

  const id = parsed.id || toKebabCase(parsed.name);

  return {
    id,
    name: parsed.name,
    nickname: parsed.nickname || parsed.name,
    emoji: parsed.emoji || '🤖',
    creature: parsed.creature || '',
    vibe: parsed.vibe || '',
    description: parsed.description || '',
    tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : ['通用'],
    scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
    soul: parsed.soul,
    agents: parsed.agents,
    tools: parsed.tools,
    user: parsed.user,
    memory: parsed.memory,
  };
}

function toKebabCase(name: string): string {
  const slug = name
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
