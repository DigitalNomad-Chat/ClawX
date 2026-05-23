import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkDetector, setBackendBaseUrl } from '@electron/services/member/network-detector';
import { memberEventBus } from '@electron/services/member/event-bus';
import { MemberEvent } from '@electron/services/member/types';

describe('NetworkDetector', () => {
  let detector: NetworkDetector;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();

    // Mock fetch globally
    global.fetch = vi.fn();

    // Spy on event-bus emit
    emitSpy = vi.spyOn(memberEventBus, 'emit');

    // Reset backend URL so tests are deterministic
    setBackendBaseUrl('http://localhost:7070');

    // Create a fresh detector instance for each test
    detector = new NetworkDetector();
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  it('初始状态为离线', () => {
    expect(detector.isOnline).toBe(false);
  });

  it('checkOnce 成功时返回 true 并触发 NETWORK_ONLINE', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    const result = await detector.checkOnce();

    expect(result).toBe(true);
    expect(detector.isOnline).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(MemberEvent.NETWORK_ONLINE);
  });

  it('checkOnce 失败时返回 false 并触发 NETWORK_OFFLINE', async () => {
    // First transition from offline -> online so we can observe online -> offline
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await detector.checkOnce();
    emitSpy.mockClear();

    // Now simulate failure
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network error'));

    const result = await detector.checkOnce();

    expect(result).toBe(false);
    expect(detector.isOnline).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(MemberEvent.NETWORK_OFFLINE);
  });

  it('状态切换时只触发对应事件', async () => {
    // Offline -> Online
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await detector.checkOnce();
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenNthCalledWith(1, MemberEvent.NETWORK_ONLINE);

    // Stay online — no new event
    emitSpy.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await detector.checkOnce();
    expect(emitSpy).not.toHaveBeenCalled();

    // Online -> Offline
    emitSpy.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    await detector.checkOnce();
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenNthCalledWith(1, MemberEvent.NETWORK_OFFLINE);

    // Stay offline — no new event
    emitSpy.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    await detector.checkOnce();
    expect(emitSpy).not.toHaveBeenCalled();

    // Offline -> Online again
    emitSpy.mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await detector.checkOnce();
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenNthCalledWith(1, MemberEvent.NETWORK_ONLINE);
  });

  it('start/stop 控制定时探测', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    detector.start();
    expect(detector.isOnline).toBe(false); // hasn't run yet

    // First scheduled check fires after 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(detector.isOnline).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second scheduled check fires after another 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Stop should prevent further checks
    detector.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('离线时探测间隔指数退避', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));

    detector.start();

    // 1st check at 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 2nd check at 5s + 10s = 15s total
    await vi.advanceTimersByTimeAsync(10000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // 3rd check at 15s + 20s = 35s total
    await vi.advanceTimersByTimeAsync(20000);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // 4th check at 35s + 40s = 75s total
    await vi.advanceTimersByTimeAsync(40000);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('恢复在线后重置探测间隔', async () => {
    // Start offline
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    detector.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Next offline check would be at 10s
    // Switch to online before then
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    await vi.advanceTimersByTimeAsync(10000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(detector.isOnline).toBe(true);

    // After going online, interval resets to 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('fetch 超时视为离线', async () => {
    // Mock fetch that rejects when AbortSignal fires (simulating timeout)
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted'));
            });
          }
        }),
    );

    // First get online so we can observe the transition
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await detector.checkOnce();
    emitSpy.mockClear();

    // Now use the abort-signal mock
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted'));
            });
          }
        }),
    );

    const checkPromise = detector.checkOnce();
    await vi.advanceTimersByTimeAsync(5000); // trigger the internal timeout
    const result = await checkPromise;

    expect(result).toBe(false);
    expect(detector.isOnline).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(MemberEvent.NETWORK_OFFLINE);
  });

  it('fetch 返回非 ok 响应视为离线', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await detector.checkOnce();

    expect(result).toBe(false);
    expect(detector.isOnline).toBe(false);
  });
});
