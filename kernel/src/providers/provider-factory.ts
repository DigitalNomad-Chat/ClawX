/**
 * Provider Factory - Creates AI provider instances
 * Supports Anthropic and OpenAI-compatible APIs
 */
import type { AIProvider, AIProviderConfig } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export function createProvider(config: AIProviderConfig): AIProvider {
  const model = config.model.toLowerCase();

  if (model.includes('claude')) {
    return new AnthropicProvider(config);
  }

  // Default to OpenAI-compatible
  return new OpenAIProvider(config);
}
