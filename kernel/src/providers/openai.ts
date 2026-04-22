/**
 * OpenAI Provider - OpenAI-compatible API adapter
 * Supports OpenAI, Azure, DeepSeek, and other compatible providers
 */
import OpenAI from 'openai';
import type {
  AIProvider,
  AIProviderConfig,
  ProviderStreamEvent,
  StreamMessageRequest,
  ToolCall,
  TokenUsage,
} from '../types.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.config = config;
  }

  async *streamMessage(
    request: StreamMessageRequest
  ): AsyncGenerator<ProviderStreamEvent> {
    console.log(`[DEBUG OpenAI] streamMessage START model=${this.config.model}, baseURL=${this.config.baseUrl || '(default)'}`);
    const tools = request.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }

    for (const m of request.messages) {
      if (m.role === 'user') {
        messages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        messages.push({ role: 'assistant', content: m.content });
      } else if (m.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: (m as Record<string, unknown>).toolCallId as string,
          content: m.content,
        });
      }
    }
    console.log(`[DEBUG OpenAI] Built messages: count=${messages.length}, systemLen=${request.system?.length || 0}`);

    console.log(`[DEBUG OpenAI] Calling chat.completions.create...`);
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      tools,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens || 8192,
      stream: true,
    });
    console.log(`[DEBUG OpenAI] chat.completions.create returned, starting stream iteration`);

    let textContent = '';
    const toolCalls: ToolCall[] = [];
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    console.log(`[DEBUG OpenAI] Starting stream iteration...`);
    let chunkCount = 0;
    for await (const chunk of stream) {
      chunkCount++;
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        textContent += delta.content;
        console.log(`[DEBUG OpenAI] Chunk #${chunkCount}: text_delta, len=${delta.content.length}`);
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls[tc.index];
          if (existing) {
            existing.name += tc.function?.name || '';
            const newArgs = tc.function?.arguments || '';
            if (newArgs) {
              const currentInput = (existing.input as string) || '';
              existing.input = currentInput + newArgs;
            }
          } else {
            toolCalls[tc.index] = {
              id: tc.id || `call_${tc.index}`,
              name: tc.function?.name || '',
              input: tc.function?.arguments || '',
            };
          }
        }
      }

      if (chunk.usage) {
        usage.inputTokens = chunk.usage.prompt_tokens || 0;
        usage.outputTokens = chunk.usage.completion_tokens || 0;
        usage.totalTokens = chunk.usage.total_tokens || 0;
      }
    }
    console.log(`[DEBUG OpenAI] Stream iteration done, chunks=${chunkCount}, textLen=${textContent.length}`);

    // Parse JSON arguments for tool calls
    for (const tc of toolCalls) {
      if (typeof tc.input === 'string') {
        try {
          tc.input = JSON.parse(tc.input);
        } catch {
          // Keep as string if not valid JSON
        }
      }
    }

    if (usage.totalTokens === 0) {
      // Estimate if not provided
      usage.inputTokens = JSON.stringify(messages).length / 4;
      usage.outputTokens = textContent.length / 4;
      usage.totalTokens = usage.inputTokens + usage.outputTokens;
    }

    yield { type: 'complete', usage, toolCalls };
  }
}
