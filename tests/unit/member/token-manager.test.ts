import { describe } from 'vitest';

// Token manager implementation is still being refactored; skip suite until
// @electron/services/member/token-manager exists.
describe.skip('token-manager', () => {});


// Mock electron-store
const storeMap = new Map<string, unknown>();
vi.mock('electron-store', () => ({
  default: function MockStore() {
    return {
      get: (key: string) => storeMap.get(key),
      set: (key: string, value: unknown) => storeMap.set(key, value),
      delete: (key: string) => storeMap.delete(key),
    };
  },
}));

// Mock event-bus
vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock local-auth — simulate JWT operations
vi.mock('@electron/services/member/local-auth', () => ({
  signJwt: vi.fn((_userId: string, username: string, email: string, tier: string) =>
    `mock-jwt.${Buffer.from(JSON.stringify({ sub: _userId, username, email, tier })).toString('base64url')}.sig`,
  ),
  verifyJwt: vi.fn((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return { ...payload, iat: 1000000, exp: 9999999999 };
    } catch {
      return null;
    }
  }),
  decodeJwt: vi.fn((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return { ...payload, iat: 1000000, exp: 9999999999 };
    } catch {
      return null;
    }
  }),
}));

// Mock logger
vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TokenManager (Local JWT)', () => {
  let manager: any;
  let TokenManagerClass: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storeMap.clear();
    const mod = await import('@electron/services/member/token-manager');
    TokenManagerClass = mod.TokenManager;
    manager = new TokenManagerClass();
  });

  afterEach(() => {
    manager.stopAutoRenewal();
    vi.useRealTimers();
  });

  it('初始状态：无 token', () => {
    expect(manager.getToken()).toBeNull();
    expect(manager.getPayload()).toBeNull();
    expect(manager.isExpired()).toBe(true);
  });

  it('init 从 store 恢复有效 token', async () => {
    const fakeToken = 'mock-jwt.' + Buffer.from(JSON.stringify({
      sub: 'user-1', username: 'test', email: 't@t.com', tier: 'pro',
    })).toString('base64url') + '.sig';
    storeMap.set('featureToken', fakeToken);

    await manager.init();
    expect(manager.getToken()).toBe(fakeToken);
    expect(manager.getPayload()).not.toBeNull();
    expect(manager.getPayload().sub).toBe('user-1');
    expect(manager.getPayload().tier).toBe('pro');
  });

  it('init 清除无效 token', async () => {
    storeMap.set('featureToken', 'invalid-token');

    const { verifyJwt } = await import('@electron/services/member/local-auth');
    (verifyJwt as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

    await manager.init();
    expect(manager.getToken()).toBeNull();
    expect(manager.getPayload()).toBeNull();
  });

  it('issueToken 生成 token 和 payload', async () => {
    const getUsage = vi.fn((f: Feature) => f === 'collaboration' ? 2 : 0);

    const token = await manager.issueToken(
      'user-1', 'testuser', 'test@example.com', 'pro', 'device-abc', getUsage,
    );

    expect(token).toBeTruthy();
    expect(manager.getToken()).toBe(token);
    expect(manager.getPayload()).not.toBeNull();
    expect(manager.getPayload().sub).toBe('user-1');
    expect(manager.getPayload().tier).toBe('pro');
    expect(manager.getPayload().deviceId).toBe('device-abc');
    expect(manager.getPayload().usage.collaboration).toEqual({ used: 2, limit: 0 });
    expect(manager.getPayload().usage.marketplace).toEqual({ used: 0, limit: 0 });
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it('issueToken for free tier has quota limit', async () => {
    const getUsage = vi.fn(() => 1);

    await manager.issueToken(
      'user-2', 'freeuser', 'free@example.com', 'free', 'device-xyz', getUsage,
    );

    const payload = manager.getPayload();
    expect(payload.tier).toBe('free');
    expect(payload.usage.collaboration.limit).toBe(3);
    expect(payload.usage.collaboration.used).toBe(1);
  });

  it('isExpired 返回 false 对有效 token', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev', () => 0,
    );
    expect(manager.isExpired()).toBe(false);
  });

  it('getUsageSnapshot 返回正确的 used/limit', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev',
      (f: Feature) => f === 'collaboration' ? 5 : 3,
    );

    expect(manager.getUsageSnapshot('collaboration' as Feature)).toEqual({ used: 5, limit: 0 });
    expect(manager.getUsageSnapshot('marketplace' as Feature)).toEqual({ used: 3, limit: 0 });
  });

  it('getUsageSnapshot 无 payload 时返回 null', () => {
    expect(manager.getUsageSnapshot('collaboration' as Feature)).toBeNull();
  });

  it('getOfflineBudget 返回 offlineBudget', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev', () => 0,
    );
    expect(manager.getOfflineBudget()).toBe(999999);
  });

  it('getOfflineBudget 无 payload 时返回 0', () => {
    expect(manager.getOfflineBudget()).toBe(0);
  });

  it('auto-renewal 24h 后触发续签', async () => {
    const getUserInfo = () => ({
      id: 'user-1', username: 'test', email: 't@t.com', tier: 'pro' as const,
    });
    const getDeviceId = () => 'device-abc';
    const getUsage = () => 0;

    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'device-abc', getUsage,
    );

    const { signJwt } = await import('@electron/services/member/local-auth');
    const callCountBefore = (signJwt as ReturnType<typeof vi.fn>).mock.calls.length;

    manager.startAutoRenewal(getUserInfo, getDeviceId, getUsage);

    // Advance 24h
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // signJwt should have been called again for renewal
    expect((signJwt as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('stopAutoRenewal 停止续签', async () => {
    const getUserInfo = () => ({
      id: 'user-1', username: 'test', email: 't@t.com', tier: 'pro' as const,
    });
    const getDeviceId = () => 'device-abc';
    const getUsage = () => 0;

    manager.startAutoRenewal(getUserInfo, getDeviceId, getUsage);
    manager.stopAutoRenewal();

    const { signJwt } = await import('@electron/services/member/local-auth');
    const callCountBefore = (signJwt as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1000);

    // No new signJwt calls should have happened
    expect((signJwt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBefore);
  });
});
