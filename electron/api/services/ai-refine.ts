/**
 * AI Refine Service — Direct LLM API call for document optimization
 * Uses kernel-llm-store config (independent from OpenClaw provider system).
 */
import { getActiveLLMProvider, type KernelApiType } from '../../extensions/marketplace/kernel-llm-store';
import { getSceneInstruction } from '../../../src/modules/office-tools/config/sceneTemplates';

export interface RefineOptions {
  text: string;
  instruction?: string;
  sceneId?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RefineResult {
  success: boolean;
  text?: string;
  error?: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
}

const DEFAULT_INSTRUCTION = '请对以下文本进行整理和优化：修正OCR识别错误、统一格式、提升可读性，保持原文意思不变。直接输出优化后的文本，不要添加解释。';

export async function refineText(options: RefineOptions): Promise<RefineResult> {
  const start = Date.now();

  const provider = await getActiveLLMProvider();
  if (!provider) {
    return { success: false, error: '未配置AI模型，请先在设置中配置LLM' };
  }

  const instruction = getSceneInstruction(options.sceneId) ?? options.instruction ?? DEFAULT_INSTRUCTION;
  const text = options.text;
  if (!text || !text.trim()) {
    return { success: false, error: '文本内容不能为空' };
  }

  try {
    const result = await callLLM(provider.api, provider.baseUrl, provider.apiKey, provider.model, {
      instruction,
      text,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 4096,
    });

    return {
      success: true,
      text: result,
      latencyMs: Date.now() - start,
      model: provider.model,
      provider: provider.name,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      latencyMs: Date.now() - start,
      model: provider.model,
      provider: provider.name,
    };
  }
}

interface LLMCallPayload {
  instruction: string;
  text: string;
  temperature: number;
  maxTokens: number;
}

async function callLLM(
  api: KernelApiType,
  baseUrl: string,
  apiKey: string,
  model: string,
  payload: LLMCallPayload,
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '');
  const fullPrompt = `${payload.instruction}\n\n${payload.text}`;

  if (api === 'anthropic') {
    const res = await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: payload.maxTokens,
        temperature: payload.temperature,
        messages: [{ role: 'user', content: fullPrompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
    const text = data.content?.[0]?.text;
    if (!text) {
      throw new Error(data.error?.message || 'Empty response from Anthropic API');
    }
    return text;
  }

  // openai
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: payload.temperature,
      max_tokens: payload.maxTokens,
      messages: [{ role: 'user', content: fullPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(data.error?.message || 'Empty response from OpenAI API');
  }
  return text;
}
