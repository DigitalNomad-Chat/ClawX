/**
 * Thin Host-lib boundary for AgentChat / kernel marketplace IPC.
 * Pages must use this (or other src/lib facades) instead of window.electron.ipcRenderer.
 * Channel names match existing Main handlers + preload allowlists.
 */
import { invokeIpc } from '@/lib/api-client';

export type KernelBridgeAgentInfo = {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version?: string;
};

export type KernelBridgeSuccess<T extends object = object> = {
  success: boolean;
  error?: string;
} & T;

export const kernelBridge = {
  getAgent(agentId: string): Promise<KernelBridgeSuccess<{ agent?: KernelBridgeAgentInfo }>> {
    return invokeIpc('marketplace:getAgent', agentId);
  },

  hireAgent(agentId: string): Promise<KernelBridgeSuccess<{ sessionId?: string }>> {
    return invokeIpc('marketplace:hireAgent', agentId);
  },

  checkActiveProvider(): Promise<
    KernelBridgeSuccess<{ providerName?: string; model?: string; needsSetup?: boolean }>
  > {
    return invokeIpc('kernel-llm:checkActive');
  },

  subscribe(sessionId: string): Promise<unknown> {
    return invokeIpc('kernel:subscribe', sessionId);
  },

  unsubscribe(sessionId: string): Promise<unknown> {
    return invokeIpc('kernel:unsubscribe', sessionId);
  },

  approvalRespond(
    requestId: string,
    approved: boolean,
    autoApprove = false,
  ): Promise<unknown> {
    return invokeIpc('kernel:approvalRespond', requestId, approved, autoApprove);
  },
};
