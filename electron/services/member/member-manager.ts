import type { LoginCredentials, RegisterCredentials, UserInfo, MemberState, Tier } from './types';
import { MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { resolveApiBaseUrl } from '../../config/server';

export class MemberManager {
  private jwtToken: string | null = null;
  private userInfo: UserInfo | null = null;
  private store: any = null; // electron-store 延迟加载
  private readonly apiBaseUrl: string;

  constructor(apiBaseUrl?: string) {
    this.apiBaseUrl = apiBaseUrl ?? resolveApiBaseUrl();
  }

  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    this.store = new Store({ name: 'clawdock-member' });
    // 恢复缓存的登录状态
    this.jwtToken = this.store.get('jwtToken', null);
    this.userInfo = this.store.get('userInfo', null);
  }

  get state(): MemberState {
    return {
      isLoggedIn: !!this.jwtToken && !!this.userInfo,
      isGuest: !this.jwtToken,
      userInfo: this.userInfo ?? null,
      tier: this.userInfo?.subscriptionTier ?? null,
      isOnline: false, // 由 NetworkDetector 设置
      featureToken: null, // 由 TokenManager 设置
    };
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, reason: data.message || 'Login failed' };
      }
      this.jwtToken = data.access_token ?? data.accessToken ?? null;
      // login 返回的 user 可能缺少 subscriptionTier，优先用 profile 补齐
      const profile = await this.refreshUser();
      if (!profile && data.user) {
        this.userInfo = this.mapUser(data.user);
        this.persist();
      }
      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: this.userInfo ?? undefined };
    } catch (err: any) {
      return { success: false, reason: err.message || 'Network error' };
    }
  }

  async register(credentials: RegisterCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, reason: data.message || 'Registration failed' };
      }
      this.jwtToken = data.access_token ?? data.accessToken ?? null;
      // register 返回的 user 可能缺少 subscriptionTier，优先用 profile 补齐
      const profile = await this.refreshUser();
      if (!profile && data.user) {
        this.userInfo = this.mapUser(data.user);
        this.persist();
      }
      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: this.userInfo ?? undefined };
    } catch (err: any) {
      return { success: false, reason: err.message || 'Network error' };
    }
  }

  async logout(): Promise<void> {
    this.jwtToken = null;
    this.userInfo = null;
    if (this.store) {
      this.store.clear();
    }
    memberEventBus.emit(MemberEvent.LOGOUT);
  }

  async refreshUser(): Promise<UserInfo | null> {
    if (!this.jwtToken) return null;
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/user/profile`, {
        headers: { Authorization: `Bearer ${this.jwtToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          await this.logout();
        }
        return null;
      }
      const data = await res.json();
      this.userInfo = this.mapUser(data);
      this.persist();
      return this.userInfo;
    } catch {
      return null;
    }
  }

  getJwtToken(): string | null {
    return this.jwtToken;
  }

  private mapUser(raw: any): UserInfo {
    return {
      id: raw.id,
      username: raw.username,
      email: raw.email,
      avatarUrl: raw.avatarUrl,
      subscriptionTier: raw.subscriptionTier || 'free',
      balance: raw.balance ?? 0,
    };
  }

  private persist(): void {
    if (this.store) {
      this.store.set('jwtToken', this.jwtToken);
      this.store.set('userInfo', this.userInfo);
    }
  }
}
