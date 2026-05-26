/**
 * MemberManager (Local)
 * Handles local user registration, login, logout, and profile management.
 * All data stored in SQLite (via database.ts).
 */
import type { LoginCredentials, RegisterCredentials, UserInfo, MemberState } from './types';
import { MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { getMemberDatabase } from './database';
import { hashPassword, verifyPassword, signJwt, verifyJwt, generateId } from './local-auth';
import { isSubscriptionActive } from './subscription';
import { logger } from '../../utils/logger';
import type { DbUser, DbSubscription } from './types';

export class MemberManager {
  private jwtToken: string | null = null;
  private userInfo: UserInfo | null = null;
  private _initialized = false;

  constructor(_apiBaseUrl?: string) {
    // Local mode: apiBaseUrl is no longer used
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    // Restore session from persisted JWT in electron-store
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    const cachedToken = store.get('jwtToken', null) as string | null;

    if (cachedToken) {
      const payload = verifyJwt(cachedToken);
      if (payload) {
        this.jwtToken = cachedToken;
        // Fetch full user info from DB
        try {
          const db = getMemberDatabase();
          const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as DbUser | undefined;
          if (row) {
            this.userInfo = this.mapDbUserToUserInfo(row);
          }
        } catch {
          // DB not ready yet, will retry on next refreshUser
        }
      } else {
        store.delete('jwtToken');
      }
    }

    this._initialized = true;
  }

  get state(): MemberState {
    return {
      isLoggedIn: !!this.jwtToken && !!this.userInfo,
      isGuest: !this.jwtToken,
      userInfo: this.userInfo ?? null,
      tier: this.userInfo?.subscriptionTier ?? null,
      isOnline: false,
      featureToken: null,
    };
  }

  async register(credentials: RegisterCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const db = getMemberDatabase();

      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(
        credentials.username,
        credentials.email,
      ) as { id: string } | undefined;

      if (existingUser) {
        return { success: false, reason: 'Username or email already exists' };
      }

      const now = Date.now();
      const userId = generateId();
      const passwordHash = hashPassword(credentials.password);

      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(userId, credentials.username, credentials.email, passwordHash, now, now);

      const subId = generateId();
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, tier, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(subId, userId, 'free', 'active', now, now);

      const userInfo: UserInfo = {
        id: userId,
        username: credentials.username,
        email: credentials.email,
        subscriptionTier: 'free',
        balance: 0,
      };

      this.userInfo = userInfo;
      this.jwtToken = signJwt(userId, credentials.username, credentials.email, 'free');
      this.persist();

      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: userInfo };
    } catch (err: any) {
      logger.error('[MemberManager] Registration error:', err);
      return { success: false, reason: err.message || 'Registration failed' };
    }
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const db = getMemberDatabase();

      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(credentials.username) as
        | DbUser
        | undefined;

      if (!row) {
        return { success: false, reason: 'Invalid username or password' };
      }

      const valid = verifyPassword(credentials.password, row.password_hash);
      if (!valid) {
        return { success: false, reason: 'Invalid username or password' };
      }

      const tier = this.resolveUserTier(row.id);

      const userInfo: UserInfo = {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: row.avatar_url ?? undefined,
        subscriptionTier: tier,
        balance: 0,
      };

      this.userInfo = userInfo;
      this.jwtToken = signJwt(row.id, row.username, row.email, tier);
      this.persist();

      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: userInfo };
    } catch (err: any) {
      logger.error('[MemberManager] Login error:', err);
      return { success: false, reason: err.message || 'Login failed' };
    }
  }

  async logout(): Promise<void> {
    this.jwtToken = null;
    this.userInfo = null;

    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    store.delete('jwtToken');
    store.delete('userInfo');

    memberEventBus.emit(MemberEvent.LOGOUT);
  }

  async refreshUser(): Promise<UserInfo | null> {
    if (!this.jwtToken) return null;

    const payload = verifyJwt(this.jwtToken);
    if (!payload) {
      await this.logout();
      return null;
    }

    try {
      const db = getMemberDatabase();
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as DbUser | undefined;

      if (!row) {
        await this.logout();
        return null;
      }

      const tier = this.resolveUserTier(row.id);
      this.userInfo = {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: row.avatar_url ?? undefined,
        subscriptionTier: tier,
        balance: 0,
      };

      this.jwtToken = signJwt(row.id, row.username, row.email, tier);
      this.persist();

      return this.userInfo;
    } catch (err: any) {
      logger.error('[MemberManager] refreshUser error:', err);
      return null;
    }
  }

  getJwtToken(): string | null {
    return this.jwtToken;
  }

  getUserId(): string | null {
    return this.userInfo?.id ?? null;
  }

  private resolveUserTier(userId: string): import('./types').Tier {
    const db = getMemberDatabase();
    const sub = db
      .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1")
      .get(userId) as DbSubscription | undefined;

    if (sub && isSubscriptionActive(sub)) {
      return sub.tier;
    }

    return 'free';
  }

  private mapDbUserToUserInfo(row: DbUser): UserInfo {
    const tier = this.resolveUserTier(row.id);
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url ?? undefined,
      subscriptionTier: tier,
      balance: 0,
    };
  }

  private async persist(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    store.set('jwtToken', this.jwtToken);
    store.set('userInfo', this.userInfo);
  }
}
