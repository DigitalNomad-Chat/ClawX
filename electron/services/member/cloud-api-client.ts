/**
 * Cloud API Client
 * Replaces all local SQLite operations with HTTP calls to the NestJS backend.
 * Manages JWT token storage and session lifecycle.
 */
import { logger } from '../../utils/logger';
import { memberEventBus } from './event-bus';
import { MemberEvent, type Tier, type Feature, type UsageInfo, type UserInfo } from './types';
import { resolveApiBaseUrl } from '../../config/server';

// Lazy-load electron-store for auth persistence
let authStoreInstance: any = null;

async function getAuthStore() {
  if (!authStoreInstance) {
    const Store = (await import('electron-store')).default;
    authStoreInstance = new Store({
      name: 'auth',
      defaults: {
        token: null as string | null,
        userInfo: null as UserInfo | null,
      },
    });
  }
  return authStoreInstance;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class CloudApiClient {
  private _baseUrl: string;
  private _token: string | null = null;
  private _userInfo: UserInfo | null = null;

  constructor() {
    this._baseUrl = resolveApiBaseUrl() + '/v1';
  }

  async init(): Promise<void> {
    const store = await getAuthStore();
    this._token = store.get('token') ?? null;
    this._userInfo = store.get('userInfo') ?? null;

    if (this._token) {
      // Validate token by calling /auth/me
      try {
        const user = await this._getMe();
        if (user) {
          this._userInfo = user;
          await this._persist();
          memberEventBus.emit(MemberEvent.LOGIN_SUCCESS);
        } else {
          await this.clearSession();
        }
      } catch {
        await this.clearSession();
      }
    }
  }

  get token(): string | null {
    return this._token;
  }

  get userInfo(): UserInfo | null {
    return this._userInfo;
  }

  get isLoggedIn(): boolean {
    return !!this._token && !!this._userInfo;
  }

  async register(username: string, email: string, password: string, deviceId?: string): Promise<{ success: boolean; user?: UserInfo; token?: string; reason?: string }> {
    try {
      const res = await this._post('/auth/register', { username, email, password, deviceId });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, reason: data.message || `Registration failed (${res.status})` };
      }

      const data = await res.json();
      if (data.token && data.user) {
        this._token = data.token;
        this._userInfo = this._mapUser(data.user);
        await this._persist();
        memberEventBus.emit(MemberEvent.LOGIN_SUCCESS);
      }

      return { success: true, user: this._userInfo, token: this._token };
    } catch (err: any) {
      logger.error('[CloudApiClient] Register error:', err);
      const errMsg = err?.message || String(err);
      return { success: false, reason: `网络错误: ${errMsg}` };
    }
  }

  async login(usernameOrEmail: string, password: string, deviceId?: string): Promise<{ success: boolean; user?: UserInfo; token?: string; reason?: string }> {
    try {
      const res = await this._post('/auth/login', { usernameOrEmail, password, deviceId });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, reason: data.message || `Login failed (${res.status})` };
      }

      const data = await res.json();
      if (data.token && data.user) {
        this._token = data.token;
        this._userInfo = this._mapUser(data.user);
        await this._persist();
        memberEventBus.emit(MemberEvent.LOGIN_SUCCESS);
      }

      return { success: true, user: this._userInfo, token: this._token };
    } catch (err: any) {
      logger.error('[CloudApiClient] Login error:', err);
      const errMsg = err?.message || String(err);
      return { success: false, reason: `网络错误: ${errMsg}` };
    }
  }

  async logout(): Promise<{ success: boolean; reason?: string }> {
    try {
      if (this._token) {
        await this._post('/auth/logout', {}, this._token);
      }
    } catch (err) {
      logger.warn('[CloudApiClient] Logout server call failed:', err);
    } finally {
      await this.clearSession();
    }
    return { success: true };
  }

  async getMe(): Promise<UserInfo | null> {
    try {
      const user = await this._getMe();
      if (user) {
        this._userInfo = user;
        await this._persist();
      }
      return user;
    } catch {
      return this._userInfo;
    }
  }

  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    if (!this._token) return null;

    try {
      const res = await this._get(`/usage/check?feature=${feature}`, this._token);
      if (!res.ok) {
        if (res.status === 401) await this.clearSession();
        return null;
      }

      const data = await res.json();
      return {
        feature: data.feature as Feature,
        used: data.usedCount ?? 0,
        limit: data.monthlyQuota ?? 0,
        remaining: data.remaining ?? (data.unlimited ? 999999 : 0),
        tier: (data.tier ?? this._userInfo?.subscriptionTier ?? 'free') as Tier,
        allowed: data.hasFeature && (data.unlimited || (data.remaining ?? 0) > 0),
      };
    } catch (err: any) {
      logger.error('[CloudApiClient] checkFeature error:', err);
      return null;
    }
  }

  async recordUsage(feature: Feature): Promise<{ success: boolean }> {
    if (!this._token) return { success: false };

    try {
      const res = await this._post('/usage/record', { feature }, this._token);
      if (!res.ok) {
        if (res.status === 401) await this.clearSession();
        return { success: false };
      }
      return { success: true };
    } catch (err: any) {
      logger.error('[CloudApiClient] recordUsage error:', err);
      return { success: false };
    }
  }

  async getUsageStats(yearMonth?: string): Promise<any[]> {
    if (!this._token) return [];

    try {
      let url = '/usage/stats';
      if (yearMonth) url += `?yearMonth=${yearMonth}`;
      const res = await this._get(url, this._token);
      if (!res.ok) {
        if (res.status === 401) await this.clearSession();
        return [];
      }
      const data = await res.json();
      return data.stats ?? [];
    } catch (err: any) {
      logger.error('[CloudApiClient] getUsageStats error:', err);
      return [];
    }
  }

  async activateLicense(licenseKey: string, deviceId?: string): Promise<{ success: boolean; tier?: Tier; expiresAt?: number; reason?: string }> {
    if (!this._token) {
      return { success: false, reason: 'Please login first' };
    }

    try {
      const res = await this._post('/license/activate', { licenseKey, deviceId, clientType: 'clawx' }, this._token);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, reason: data.message || `Activation failed (${res.status})` };
      }

      const data = await res.json();
      // Refresh user info after activation
      await this.getMe();

      return {
        success: true,
        tier: data.tier as Tier,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined,
      };
    } catch (err: any) {
      logger.error('[CloudApiClient] activateLicense error:', err);
      return { success: false, reason: 'Network error. Please check your connection.' };
    }
  }

  async clearSession(): Promise<void> {
    this._token = null;
    this._userInfo = null;
    const store = await getAuthStore();
    store.set('token', null);
    store.set('userInfo', null);
    memberEventBus.emit(MemberEvent.LOGOUT);
  }

  // ---- Private helpers ----

  private async _getMe(): Promise<UserInfo | null> {
    if (!this._token) return null;
    const res = await this._get('/auth/me', this._token);
    if (!res.ok) {
      if (res.status === 401) await this.clearSession();
      return null;
    }
    const data = await res.json();
    return this._mapUser(data);
  }

  private async _persist(): Promise<void> {
    const store = await getAuthStore();
    store.set('token', this._token);
    store.set('userInfo', this._userInfo);
  }

  private _mapUser(data: any): UserInfo {
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      avatarUrl: data.avatarUrl || data.avatar_url || undefined,
      subscriptionTier: (data.tier || 'free') as Tier,
      balance: data.balance ?? 0,
    };
  }

  private async _get(path: string, token?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${this._baseUrl}${path}`, { method: 'GET', headers });
  }

  private async _post(path: string, body: any, token?: string): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${this._baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }
}

export const cloudApiClient = new CloudApiClient();
