import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock store instance that can be reset
const mockStore = new Map<string, any>();

// Mock electron-store
vi.mock('electron-store', () => {
  function MockStore() {
    return {
      get: (key: string, defaultValue?: any) => {
        if (mockStore.has(key)) return mockStore.get(key);
        return defaultValue;
      },
      set: (key: string, value: any) => mockStore.set(key, value),
      delete: (key: string) => mockStore.delete(key),
      clear: () => mockStore.clear(),
    };
  }
  return {
    default: MockStore,
  };
});

// Mock event-bus so we can spy on emits
vi.mock('@electron/services/member/event-bus', () => {
  const listeners: Record<string, any[]> = {};
  return {
    memberEventBus: {
      emit: vi.fn((event: string, ...args: any[]) => {
        if (listeners[event]) {
          listeners[event].forEach((fn) => fn(...args));
        }
        return true;
      }),
      on: vi.fn((event: string, fn: any) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      }),
      off: vi.fn(),
    },
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('MemberManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
  });

  it('should start as guest when no stored session', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();

    expect(manager.state.isGuest).toBe(true);
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.userInfo).toBeNull();
    // init() 从 store 恢复，store 无值时 get 返回 undefined
    expect(manager.getJwtToken()).toBeFalsy();
  });

  it('should login successfully and store token', async () => {
    const loginResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token-123',
        user: { id: '1', username: 'test', email: 'test@test.com', subscriptionTier: 'free' },
      }),
    };
    const profileResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '1', username: 'test', email: 'test@test.com', subscriptionTier: 'free', balance: 0,
      }),
    };
    (global.fetch as any)
      .mockResolvedValueOnce(loginResponse)
      .mockResolvedValueOnce(profileResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    const result = await manager.login({ username: 'test', password: 'password123' });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('test');
    expect(manager.getJwtToken()).toBe('jwt-token-123');
    expect(manager.state.isLoggedIn).toBe(true);
    expect(manager.state.isGuest).toBe(false);
  });

  it('should fail login with wrong credentials (401)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid credentials' }),
    });

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    const result = await manager.login({ username: 'test', password: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Invalid credentials');
    // 登录失败后 jwtToken 仍保持原值（null），isLoggedIn 为 false
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.isGuest).toBe(true);
  });

  it('should register successfully and store token', async () => {
    const registerResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-register-456',
        user: { id: '2', username: 'newbie', email: 'newbie@test.com', subscriptionTier: 'pro' },
      }),
    };
    const profileResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '2', username: 'newbie', email: 'newbie@test.com', subscriptionTier: 'pro', balance: 0,
      }),
    };
    (global.fetch as any)
      .mockResolvedValueOnce(registerResponse)
      .mockResolvedValueOnce(profileResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    const result = await manager.register({
      username: 'newbie',
      email: 'newbie@test.com',
      password: 'secret',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('newbie');
    expect(manager.getJwtToken()).toBe('jwt-register-456');
    expect(manager.state.isLoggedIn).toBe(true);
  });

  it('should logout and clear state', async () => {
    const loginResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token-789',
        user: { id: '3', username: 'logoutme', email: 'l@test.com', subscriptionTier: 'free' },
      }),
    };
    const profileResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '3', username: 'logoutme', email: 'l@test.com', subscriptionTier: 'free', balance: 0,
      }),
    };
    (global.fetch as any)
      .mockResolvedValueOnce(loginResponse)
      .mockResolvedValueOnce(profileResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    await manager.login({ username: 'logoutme', password: 'pw' });
    expect(manager.state.isLoggedIn).toBe(true);

    await manager.logout();
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.isGuest).toBe(true);
    expect(manager.getJwtToken()).toBeNull();
    expect(manager.state.userInfo).toBeNull();
  });

  it('should refresh user info successfully', async () => {
    const loginResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token-refresh',
        user: { id: '4', username: 'refresh', email: 'r@test.com', subscriptionTier: 'free' },
      }),
    };
    const loginProfileResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '4',
        username: 'refresh',
        email: 'r@test.com',
        subscriptionTier: 'free',
        balance: 0,
      }),
    };
    const meResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '4',
        username: 'refresh-updated',
        email: 'r@test.com',
        subscriptionTier: 'pro',
        balance: 100,
      }),
    };
    (global.fetch as any)
      .mockResolvedValueOnce(loginResponse)
      .mockResolvedValueOnce(loginProfileResponse)
      .mockResolvedValueOnce(meResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    await manager.login({ username: 'refresh', password: 'pw' });

    const user = await manager.refreshUser();
    expect(user).not.toBeNull();
    expect(user?.username).toBe('refresh-updated');
    expect(user?.subscriptionTier).toBe('pro');
    expect(manager.state.userInfo?.subscriptionTier).toBe('pro');
  });

  it('should auto logout on 401 during refreshUser', async () => {
    const loginResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token-401',
        user: { id: '5', username: 'unauth', email: 'u@test.com', subscriptionTier: 'free' },
      }),
    };
    const loginProfileResponse = {
      ok: true,
      json: () => Promise.resolve({
        id: '5', username: 'unauth', email: 'u@test.com', subscriptionTier: 'free', balance: 0,
      }),
    };
    const refreshResponse = {
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    };
    (global.fetch as any)
      .mockResolvedValueOnce(loginResponse)
      .mockResolvedValueOnce(loginProfileResponse)
      .mockResolvedValueOnce(refreshResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    await manager.init();
    await manager.login({ username: 'unauth', password: 'pw' });
    expect(manager.state.isLoggedIn).toBe(true);

    const user = await manager.refreshUser();
    expect(user).toBeNull();
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.isGuest).toBe(true);
  });
});
