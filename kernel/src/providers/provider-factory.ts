/**
 * Provider Factory - Creates AI provider instances
 * Supports Anthropic and OpenAI-compatible APIs
 */
import type { AIProvider, AIProviderConfig } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export function createProvider(config: AIProviderConfig): AIProvider {
  // Prefer explicit api type from config; fallback to model-name heuristics
  const apiType = config.api?.toLowerCase();
  if (apiType === 'anthropic') {
    return new AnthropicProvider(config);
  }
  if (apiType === 'openai') {
    return new OpenAIProvider(config);
  }

  // Legacy fallback: detect from model name
  const model = config.model.toLowerCase();
  if (model.includes('claude')) {
    return new AnthropicProvider(config);
  }

  // Default to OpenAI-compatible
  return new OpenAIProvider(config);
}
