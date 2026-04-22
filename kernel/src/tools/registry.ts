/**
 * Tool Registry - Manages available tools and enforces whitelist/blacklist
 */
import type { RegisteredTool, ToolDefinition, ToolExecuteFn, ToolExecutionContext } from '../types.js';

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, execute: ToolExecuteFn): void {
    this.tools.set(definition.name, { ...definition, execute });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(({ execute, ...def }) => def);
  }

  /**
   * Filter tools based on agent whitelist/blacklist
   */
  filter(whitelist?: string[], blacklist?: string[]): ToolDefinition[] {
    const all = this.list();

    if (whitelist && whitelist.length > 0) {
      return all.filter((t) => whitelist.includes(t.name));
    }

    if (blacklist && blacklist.length > 0) {
      return all.filter((t) => !blacklist.includes(t.name));
    }

    return all;
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, input: unknown, context?: ToolExecutionContext): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }
    return tool.execute(input, context);
  }
}
