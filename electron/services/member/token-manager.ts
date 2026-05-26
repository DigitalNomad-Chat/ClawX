/**
 * TokenManager (Local JWT)
 * Issues local JWTs containing user tier and usage snapshot.
 * No remote API calls — all tokens are self-signed locally.
 */
import { Feature, MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { verifyJwt, decodeJwt, signJwt } from './local-auth';
import { getTierConfig } from './subscription';
import { logger } from '../../utils/logger';
import type { LocalJwtPayload } from './local-auth';

const FEATURE_TOKEN_KEY = 'featureToken';
const AUTO_RENEWAL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface FeatureTokenPayload {
  sub: string;
  tier: import('./types').Tier;
  deviceId: string;
  clientType: string;
  features: string[];
  keyId: string;
  usage: Record<Feature, { used: number; limit: number }>;
  offlineBudget: number;
  iat: number;
  exp: number;
}

export class TokenManager {
  private _token: string | null = null;
  private _payload: FeatureTokenPayload | null = null;
  private _renewalTimer: ReturnType<typeof setTimeout> | null = null;

  getToken(): string | null {
    return this._token;
  }

  getPayload(): FeatureTokenPayload | null {
    return this._payload;
  }

  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'member' });
    const cached = store.get(FEATURE_TOKEN_KEY) as string | undefined;

    if (cached) {
      const payload = this.decodeTokenPayload(cached);
      if (payload && payload.exp * 1000 > Date.now()) {
        this._token = cached;
        this._payload = payload;
      } else {
        store.delete(FEATURE_TOKEN_KEY);
        this._token = null;
        this._payload = null;
      }
    }
  }

  async issueToken(
    userId: string,
    username: string,
    email: string,
    tier: import('./types').Tier,
    deviceId: string,
    getUsage: (feature: Feature) => number,
  ): Promise<string> {
    const config = getTierConfig(tier);
    const features = config.features;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 7 * 24 * 60 * 60;

    const usage: Record<Feature, { used: number; limit: number }> = {
      collaboration: { used: getUsage('collaboration'), limit: config.monthlyQuota },
      marketplace: { used: getUsage('marketplace'), limit: config.monthlyQuota },
    };

    const payload: FeatureTokenPayload = {
      sub: userId,
      tier,
      deviceId,
      clientType: 'clawx',
      features,
      keyId: 'local',
      usage,
      offlineBudget: 999999,
      iat: nowSec,
      exp: expSec,
    };

    const token = signJwt(userId, username, email, tier);
    this._token = token;
    this._payload = payload;
    await this.persist();

    return token;
  }

  isExpired(): boolean {
    if (!this._payload) return true;
    return this._payload.exp * 1000 <= Date.now();
  }

  getOfflineBudget(): number {
    return this._payload?.offlineBudget ?? 0;
  }

  getUsageSnapshot(feature: Feature): { used: number; limit: number } | null {
    if (!this._payload) return null;
    const entry = this._payload.usage[feature];
    if (!entry) return null;
    return { used: entry.used, limit: entry.limit };
  }

  startAutoRenewal(
    getUserInfo: () => { id: string; username: string; email: string; tier: import('./types').Tier } | null,
    getDeviceId: () => string | null,
    getUsage: (feature: Feature) => number,
  ): void {
    this.stopAutoRenewal();

    const tick = async () => {
      try {
        const user = getUserInfo();
        const deviceId = getDeviceId();
        if (user && deviceId) {
          await this.issueToken(user.id, user.username, user.email, user.tier, deviceId, getUsage);
        }
      } catch (err) {
        memberEventBus.emit(MemberEvent.TOKEN_EXPIRED, err);
      }
      this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
      if (this._renewalTimer && typeof this._renewalTimer === 'object' && 'unref' in this._renewalTimer) {
        (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    };

    this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
    if (this._renewalTimer && typeof this._renewalTimer === 'object' && 'unref' in this._renewalTimer) {
      (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  stopAutoRenewal(): void {
    if (this._renewalTimer !== null) {
      clearTimeout(this._renewalTimer);
      this._renewalTimer = null;
    }
  }

  decodeTokenPayload(token: string): FeatureTokenPayload | null {
    const payload = decodeJwt(token);
    if (!payload) return null;

    const config = getTierConfig(payload.tier as import('./types').Tier);
    return {
      sub: payload.sub,
      tier: payload.tier as import('./types').Tier,
      deviceId: 'local',
      clientType: 'clawx',
      features: config.features,
      keyId: 'local',
      usage: {
        collaboration: { used: 0, limit: config.monthlyQuota },
        marketplace: { used: 0, limit: config.monthlyQuota },
      },
      offlineBudget: 999999,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  private async persist(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'member' });
    if (this._token) {
      store.set(FEATURE_TOKEN_KEY, this._token);
    } else {
      store.delete(FEATURE_TOKEN_KEY);
    }
  }
}

export const tokenManager = new TokenManager();
