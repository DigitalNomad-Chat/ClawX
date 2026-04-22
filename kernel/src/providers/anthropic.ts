/**
 * Anthropic Provider - Claude API adapter
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AIProviderConfig,
  Message,
  ProviderStreamEvent,
  StreamMessageRequest,
  ToolDefinition,
  ToolCall,
  TokenUsage,
} from '../types.js';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.config = config;
  }

  async *streamMessage(
    request: StreamMessageRequest
  ): AsyncGenerator<ProviderStreamEvent> {
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    // Convert messages to Anthropic format
    const systemMessage = request.system;
    const conversationMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content };
        }
        if (m.role === 'assistant') {
          // Handle assistant messages with tool calls
          const msg: Record<string, unknown> = {
            role: 'assistant',
            content: m.content,
          };
          // Tool calls would be added here if needed
          return msg;
        }
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result',
                tool_use_id: (m as Record<string, unknown>).toolCallId,
                content: m.content,
              },
            ],
          };
        }
        return { role: 'user' as const, content: m.content };
      });

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 8192,
      temperature: this.config.temperature ?? 0.7,
      system: systemMessage,
      messages: conversationMessages as Anthropic.Messages.MessageParam[],
      tools: tools as Anthropic.Messages.Tool[],
    });

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textContent += event.delta.text;
          yield { type: 'text_delta', text: event.delta.text };
        }
      }

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCalls.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: event.content_block.input as Record<string, unknown>,
          });
        }
      }
    }

    const final = await stream.finalMessage();
    const usage: TokenUsage = {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      totalTokens: final.usage.input_tokens + final.usage.output_tokens,
    };

    yield { type: 'complete', usage, toolCalls };
  }
}
