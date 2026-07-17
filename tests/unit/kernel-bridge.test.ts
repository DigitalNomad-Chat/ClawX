import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeIpcMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  invokeIpc: (...args: unknown[]) => invokeIpcMock(...args),
}));

describe('kernel-bridge', () => {
  beforeEach(() => {
    invokeIpcMock.mockReset();
    invokeIpcMock.mockResolvedValue({ success: true });
  });

  it('forwards marketplace.getAgent with agentId', async () => {
    const { kernelBridge } = await import('@/lib/kernel-bridge');
    invokeIpcMock.mockResolvedValueOnce({ success: true, agent: { id: 'a1' } });
    const result = await kernelBridge.getAgent('a1');
    expect(invokeIpcMock).toHaveBeenCalledWith('marketplace:getAgent', 'a1');
    expect(result).toEqual({ success: true, agent: { id: 'a1' } });
  });

  it('forwards marketplace.hireAgent with agentId', async () => {
    const { kernelBridge } = await import('@/lib/kernel-bridge');
    invokeIpcMock.mockResolvedValueOnce({ success: true, sessionId: 's1' });
    const result = await kernelBridge.hireAgent('a1');
    expect(invokeIpcMock).toHaveBeenCalledWith('marketplace:hireAgent', 'a1');
    expect(result.sessionId).toBe('s1');
  });

  it('forwards kernel-llm.checkActive with no args', async () => {
    const { kernelBridge } = await import('@/lib/kernel-bridge');
    invokeIpcMock.mockResolvedValueOnce({ success: true, providerName: 'openai', model: 'gpt' });
    await kernelBridge.checkActiveProvider();
    expect(invokeIpcMock).toHaveBeenCalledWith('kernel-llm:checkActive');
  });

  it('forwards kernel subscribe/unsubscribe/approvalRespond', async () => {
    const { kernelBridge } = await import('@/lib/kernel-bridge');
    await kernelBridge.subscribe('sess-1');
    await kernelBridge.unsubscribe('sess-1');
    await kernelBridge.approvalRespond('req-1', true, false);
    expect(invokeIpcMock).toHaveBeenNthCalledWith(1, 'kernel:subscribe', 'sess-1');
    expect(invokeIpcMock).toHaveBeenNthCalledWith(2, 'kernel:unsubscribe', 'sess-1');
    expect(invokeIpcMock).toHaveBeenNthCalledWith(3, 'kernel:approvalRespond', 'req-1', true, false);
  });
});
