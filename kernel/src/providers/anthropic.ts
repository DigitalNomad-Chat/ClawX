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
          // Build assistant message with optional tool_use blocks
          const assistantMsg = m as Record<string, unknown>;
          const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content });
          }
          const calls = assistantMsg.toolCalls as Array<{ id: string; name: string; input: Record<string, unknown> }> | undefined;
          if (calls) {
            for (const call of calls) {
              contentBlocks.push({
                type: 'tool_use',
                id: call.id,
                name: call.name,
                input: call.input,
              } as Anthropic.Messages.ToolUseBlockParam);
            }
          }
          return {
            role: 'assistant' as const,
            content: contentBlocks,
          };
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
    // Accumulate partial JSON for the current tool call (Anthropic streams input_json_delta)
    let currentToolInputJson = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textContent += event.delta.text;
          yield { type: 'text_delta', text: event.delta.text };
        }
        if (event.delta.type === 'input_json_delta') {
          currentToolInputJson += event.delta.partial_json;
        }
      }

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCalls.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: {}, // placeholder; will be replaced at content_block_stop
          });
          currentToolInputJson = '';
        }
      }

      if (event.type === 'content_block_stop') {
        // Finalize the last tool call's input by parsing accumulated JSON
        if (currentToolInputJson && toolCalls.length > 0) {
          const lastCall = toolCalls[toolCalls.length - 1];
          try {
            lastCall.input = JSON.parse(currentToolInputJson);
          } catch {
            lastCall.input = {};
          }
          currentToolInputJson = '';
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
