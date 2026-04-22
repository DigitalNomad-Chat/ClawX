/**
 * Tools Module - Initialize and export all built-in tools
 */
import { ToolRegistry } from './registry.js';
import { bashToolDefinition, executeBash } from './bash.js';
import { fileReadToolDefinition, executeFileRead } from './file-read.js';
import { fileWriteToolDefinition, executeFileWrite } from './file-write.js';
import { webFetchToolDefinition, executeWebFetch } from './web-fetch.js';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(bashToolDefinition, executeBash);
  registry.register(fileReadToolDefinition, executeFileRead);
  registry.register(fileWriteToolDefinition, executeFileWrite);
  registry.register(webFetchToolDefinition, executeWebFetch);

  return registry;
}

export * from './registry.js';
