/**
 * Prompt Builder - Assembles the complete system prompt from AgentConfig
 * Combines SOUL.md, AGENTS.md, TOOLS.md, USER.md into a single system prompt
 */
import type { AgentConfig } from '../types.js';

/**
 * Build the complete system prompt for an agent
 * Follows the OpenClaw L1/L2/L3 layering:
 * - L1 (SOUL): Identity + mission + principles + constraints
 * - L2 (AGENTS): Session rules + decision trees + quality gates
 * - L3 (TOOLS): Tool configuration + reference materials
 */
export function buildSystemPrompt(config: AgentConfig): string {
  const parts: string[] = [];

  // L1: Core Identity (SOUL)
  parts.push(`# ${config.identity.name} (${config.identity.nickname})`);
  parts.push(`You are a ${config.identity.creature}.`);
  parts.push(`Vibe: ${config.identity.vibe}`);
  parts.push('');
  parts.push(config.soul);
  parts.push('');

  // L2: Working Handbook (AGENTS)
  if (config.agents) {
    parts.push('---');
    parts.push(config.agents);
    parts.push('');
  }

  // L3: Tool Configuration (TOOLS)
  if (config.tools) {
    parts.push('---');
    parts.push('## Available Tools');
    parts.push(config.tools);
    parts.push('');
  }

  // User Profile (USER)
  if (config.user) {
    parts.push('---');
    parts.push('## User Profile');
    parts.push(config.user);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Build a context summary for a new session
 */
export function buildSessionContext(config: AgentConfig): string {
  return `You are ${config.identity.name}. Your identity is ${config.identity.creature}. ${config.identity.vibe}.`;
}
