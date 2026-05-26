import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron-store
const mockStore = new Map<string, any>();
vi.mock('electron-store', () => {
  function MockStore(opts?: { name?: string; projectName?: string; cwd?: string }) {
    const prefix = opts?.name ? `${opts.name}:` : '';
    return {
      get: (key: string, defaultValue?: any) => {
        const fullKey = prefix + key;
        if (mockStore.has(fullKey)) return mockStore.get(fullKey);
        return defaultValue;
      },
      set: (key: string, value: any) => mockStore.set(prefix + key, value),
      delete: (key: string) => mockStore.delete(prefix + key),
      clear: () => {
        for (const k of mockStore.keys()) {
          if (k.startsWith(prefix)) mockStore.delete(k);
        }
      },
    };
  }
  return { default: MockStore };
});

// Mock event-bus
vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock database
let mockDb: { [table: string]: any[] } = {};
const mockStatements = new Map<string, any>();

vi.mock('@electron/services/member/database', () => ({
  initMemberDatabase: vi.fn(),
  getMemberDatabase: vi.fn(() => ({
    prepare: vi.fn((sql: string) => {
      if (!mockStatements.has(sql)) {
        mockStatements.set(sql, {
          get: vi.fn((...params: any[]) => {
            if (sql.includes('users') && sql.includes('username')) {
              const username = params[0];
              const table = mockDb['users'] ?? [];
              return table.find((r: any) => r.username === username) ?? undefined;
            }
            if (sql.includes('users') && sql.includes('id = ?')) {
              const id = params[0];
              const table = mockDb['users'] ?? [];
              return table.find((r: any) => r.id === id) ?? undefined;
            }
            if (sql.includes('subscriptions')) {
              const userId = params[0];
              const table = mockDb['subscriptions'] ?? [];
              return table.find((r: any) => r.user_id === userId && r.status === 'active') ?? undefined;
            }
            return undefined;
          }),
          run: vi.fn((...params: any[]) => {
            if (sql.includes('INSERT INTO users')) {
              if (!mockDb['users']) mockDb['users'] = [];
              mockDb['users'].push({
                id: params[0],
                username: params[1],
                email: params[2],
                password_hash: params[3],
                created_at: params[4],
                updated_at: params[5],
              });
            }
            if (sql.includes('INSERT INTO subscriptions')) {
              if (!mockDb['subscriptions']) mockDb['subscriptions'] = [];
              mockDb['subscriptions'].push({
                id: params[0],
                user_id: params[1],
                tier: params[2],
                status: 'active',
                created_at: params[5],
              });
            }
            return { changes: 1 };
          }),
        });
      }
      return mockStatements.get(sql);
    }),
  })),
}));

describe('MemberManager (Local)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockDb = {};
    mockStatements.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start as guest when no stored session', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    expect(manager.state.isGuest).toBe(true);
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.userInfo).toBeNull();
    expect(manager.getJwtToken()).toBeFalsy();
  });

  it('should register a new user and auto-login', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    const result = await manager.register({
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('newuser');
    expect(result.user?.subscriptionTier).toBe('free');
    expect(manager.state.isLoggedIn).toBe(true);
    expect(manager.state.isGuest).toBe(false);
    expect(manager.getJwtToken()).toBeTruthy();
  });

  it('should login with correct credentials', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    await manager.register({
      username: 'testlogin',
      email: 'login@example.com',
      password: 'secret123',
    });
    await manager.logout();

    const result = await manager.login({
      username: 'testlogin',
      password: 'secret123',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('testlogin');
    expect(manager.state.isLoggedIn).toBe(true);
  });

  it('should fail login with wrong password', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    await manager.register({
      username: 'wrongpw',
      email: 'wrong@example.com',
      password: 'correct123',
    });
    await manager.logout();

    const result = await manager.login({
      username: 'wrongpw',
      password: 'wrongpassword',
    });

    expect(result.success).toBe(false);
    expect(manager.state.isLoggedIn).toBe(false);
  });

  it('should logout and clear state', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    await manager.register({
      username: 'logoutme',
      email: 'logout@example.com',
      password: 'pw123',
    });
    expect(manager.state.isLoggedIn).toBe(true);

    await manager.logout();
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.isGuest).toBe(true);
    expect(manager.getJwtToken()).toBeNull();
  });

  it('should restore session from valid JWT on init', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager1 = new MemberManager();
    await manager1.init();

    await manager1.register({
      username: 'persist',
      email: 'persist@example.com',
      password: 'pw123',
    });

    const token = manager1.getJwtToken();
    expect(token).toBeTruthy();

    const { MemberManager: MM2 } = await import('@electron/services/member/member-manager');
    const manager2 = new MM2();
    await manager2.init();

    expect(manager2.state.isLoggedIn).toBe(true);
    expect(manager2.state.userInfo?.username).toBe('persist');
  });
});
