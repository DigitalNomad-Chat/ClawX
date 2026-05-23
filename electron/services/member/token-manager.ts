import { FeatureTokenPayload, Feature, MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { resolveApiBaseUrl } from '../../config/server';

/** Backend base URL — injectable for tests */
let _backendBaseUrl = resolveApiBaseUrl();

export function setBackendBaseUrl(url: string): void {
  _backendBaseUrl = url;
}

/** Store key for persisting the raw feature token string */
const FEATURE_TOKEN_KEY = 'featureToken';

/** Auto-renewal interval: 24 hours in ms */
const AUTO_RENEWAL_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Manages the lifecycle of a Feature Token:
 * - issuing from the backend
 * - caching in electron-store
 * - decoding JWT payload (no RSA verification)
 * - auto-renewal before expiry
 */
export class TokenManager {
  private _token: string | null = null;
  private _payload: FeatureTokenPayload | null = null;
  private _renewalTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current raw JWT token */
  getToken(): string | null {
    return this._token;
  }

  /** Decoded payload (null if no valid token) */
  getPayload(): FeatureTokenPayload | null {
    return this._payload;
  }

  /**
   * Initialise from persisted store.
   * If the cached token is expired it is cleared.
   */
  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'member' });
    const cached = store.get(FEATURE_TOKEN_KEY) as string | undefined;

    if (cached) {
      const payload = this.decodeJwtPayload(cached);
      if (payload && payload.exp * 1000 > Date.now()) {
        this._token = cached;
        this._payload = payload;
      } else {
        // expired or malformed — clear it
        store.delete(FEATURE_TOKEN_KEY);
        this._token = null;
        this._payload = null;
      }
    }
  }

  /**
   * Request a new Feature Token from the backend.
   * @param jwtToken   User JWT (bearer token for the request)
   * @param deviceId   Unique device identifier
   * @returns The raw JWT feature token string
   */
  async issueToken(jwtToken: string, deviceId: string): Promise<string> {
    const url = `${_backendBaseUrl}/api/v1/license/issue`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ clientType: 'clawx', deviceId }),
    });

    if (!res.ok) {
      throw new Error(`Token issue failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { token?: string; featureToken?: string };
    const rawToken = data.token ?? data.featureToken;
    if (!rawToken || typeof rawToken !== 'string') {
      throw new Error('Token issue response missing token field');
    }

    const payload = this.decodeJwtPayload(rawToken);
    if (!payload) {
      throw new Error('Failed to decode issued token payload');
    }

    this._token = rawToken;
    this._payload = payload;
    await this.persist();

    return rawToken;
  }

  /** Check whether the current token is expired */
  isExpired(): boolean {
    if (!this._payload) return true;
    return this._payload.exp * 1000 <= Date.now();
  }

  /** Return the offline budget from the current token */
  getOfflineBudget(): number {
    return this._payload?.offlineBudget ?? 0;
  }

  /**
   * Return usage snapshot for a specific feature.
   * @returns `{ used, limit }` or `null` if token/payload unavailable
   */
  getUsageSnapshot(feature: Feature): { used: number; limit: number } | null {
    if (!this._payload) return null;
    const entry = this._payload.usage[feature];
    if (!entry) return null;
    return { used: entry.used, limit: entry.limit };
  }

  /**
   * Start a 24-hour auto-renewal timer.
   * @param getJwtToken  Callback that returns the current user JWT
   * @param getDeviceId  Callback that returns the current device id
   */
  startAutoRenewal(
    getJwtToken: () => string | Promise<string>,
    getDeviceId: () => string | Promise<string>,
  ): void {
    this.stopAutoRenewal();

    const tick = async () => {
      try {
        const jwt = await getJwtToken();
        const deviceId = await getDeviceId();
        await this.issueToken(jwt, deviceId);
      } catch (err) {
        // Emit token-expired so the UI / member-manager can react
        memberEventBus.emit(MemberEvent.TOKEN_EXPIRED, err);
      }
      // Schedule next tick
      this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
      if (
        this._renewalTimer &&
        typeof this._renewalTimer === 'object' &&
        'unref' in this._renewalTimer
      ) {
        (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    };

    this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
    if (
      this._renewalTimer &&
      typeof this._renewalTimer === 'object' &&
      'unref' in this._renewalTimer
    ) {
      (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  /** Stop the auto-renewal timer */
  stopAutoRenewal(): void {
    if (this._renewalTimer !== null) {
      clearTimeout(this._renewalTimer);
      this._renewalTimer = null;
    }
  }

  /**
   * Decode the JWT payload section (middle part) without RSA verification.
   * @param token Raw JWT string
   * @returns Parsed payload or null on failure
   */
  decodeJwtPayload(token: string): FeatureTokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payloadBase64 = parts[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(payloadJson) as FeatureTokenPayload;
    } catch {
      return null;
    }
  }

  /** Persist the current token to electron-store */
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

/** Singleton instance */
export const tokenManager = new TokenManager();
