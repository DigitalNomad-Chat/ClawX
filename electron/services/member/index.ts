import { machineId } from 'node-machine-id';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { MemberManager } from './member-manager';
import { TokenManager, tokenManager } from './token-manager';
import { UsageCounter, usageCounter } from './usage-counter';
import { NetworkDetector, networkDetector } from './network-detector';
import { memberEventBus } from './event-bus';
import { MemberEvent, type MemberState, type Feature, type UsageInfo, type Tier } from './types';
import { logger } from '../../utils/logger';
import { resolveApiBaseUrl } from '../../config/server';

/** Generate a stable device id from machine-id + platform + sha256 */
async function generateDeviceId(): Promise<string> {
  const raw = await machineId();
  const plat = platform();
  return createHash('sha256').update(`${raw}:${plat}`).digest('hex');
}

/**
 * MemberModule is the facade that wires together:
 * - MemberManager   (login / register / user state)
 * - TokenManager    (feature token lifecycle)
 * - UsageCounter    (local offline usage counting)
 * - NetworkDetector (online / offline probing)
 */
export class MemberModule {
  readonly manager: MemberManager;
  readonly token: TokenManager;
  readonly usage: UsageCounter;
  readonly network: NetworkDetector;

  private _deviceId: string | null = null;
  private _initialized = false;

  constructor() {
    const apiBaseUrl = resolveApiBaseUrl();
    this.manager = new MemberManager(apiBaseUrl);
    this.token = tokenManager;
    this.usage = usageCounter;
    this.network = networkDetector;
  }

  /** Initialize all sub-services and wire event listeners */
  async init(): Promise<void> {
    if (this._initialized) return;

    this._deviceId = await generateDeviceId();

    await this.manager.init();
    await this.token.init();
    await this.usage.init();

    // Wire network status into member state
    memberEventBus.on(MemberEvent.NETWORK_ONLINE, () => {
      logger.debug('[MemberModule] Network online');
    });
    memberEventBus.on(MemberEvent.NETWORK_OFFLINE, () => {
      logger.debug('[MemberModule] Network offline');
    });

    // On login success: issue feature token and start auto-renewal
    memberEventBus.on(MemberEvent.LOGIN_SUCCESS, async () => {
      try {
        const jwt = this.manager.getJwtToken();
        if (jwt && this._deviceId) {
          await this.token.issueToken(jwt, this._deviceId);
          this.token.startAutoRenewal(
            () => this.manager.getJwtToken() ?? '',
            () => this._deviceId ?? '',
          );
        }
      } catch (err) {
        logger.warn('[MemberModule] Failed to issue feature token after login:', err);
      }
    });

    // On logout: stop auto-renewal and clear token
    memberEventBus.on(MemberEvent.LOGOUT, () => {
      this.token.stopAutoRenewal();
    });

    // Start network probing
    this.network.start();

    this._initialized = true;
    logger.info('[MemberModule] Initialized');
  }

  /** Aggregated member state for the renderer */
  get state(): MemberState {
    return {
      ...this.manager.state,
      isOnline: this.network.isOnline,
      featureToken: this.token.getPayload(),
    };
  }

  /** Current device id (stable per machine) */
  get deviceId(): string | null {
    return this._deviceId;
  }

  /**
   * Check whether a feature is available.
   * Online  -> hit backend /usage/check
   * Offline -> validate against feature token + local usage counter
   */
  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    const jwt = this.manager.getJwtToken();
    if (!jwt) {
      return null;
    }

    // Online path
    if (this.network.isOnline) {
      try {
        const apiBaseUrl = resolveApiBaseUrl();
        const query = new URLSearchParams({ feature });
        const res = await fetch(`${apiBaseUrl}/api/v1/usage/check?${query.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            allowed: boolean;
            used: number;
            limit: number;
          };
          return {
            feature,
            used: data.used,
            limit: data.limit,
            remaining: Math.max(0, data.limit - data.used),
            tier: this.manager.state.subscriptionTier ?? 'free',
            allowed: data.allowed,
          };
        }
      } catch (err) {
        logger.warn('[MemberModule] Online feature check failed, falling back to offline:', err);
      }
    }

    // Offline path
    const snapshot = this.token.getUsageSnapshot(feature);
    if (!snapshot) {
      return null;
    }
    const offlineBudget = this.token.getOfflineBudget();
    const allowed = this.usage.checkOfflineBudget(feature, snapshot, offlineBudget);
    if (!allowed) {
      return null;
    }

    return {
      feature,
      used: snapshot.used + this.usage.getCount(feature),
      limit: snapshot.limit,
      remaining: Math.max(0, snapshot.limit - snapshot.used - this.usage.getCount(feature)),
      tier: this.token.getPayload()?.tier ?? 'free',
      allowed: true,
    };
  }

  /** Record a local usage increment for a feature */
  recordUsage(feature: Feature): void {
    this.usage.increment(feature);
  }

  /** Graceful shutdown of all sub-services */
  async shutdown(): Promise<void> {
    this.network.stop();
    this.token.stopAutoRenewal();
    this._initialized = false;
    logger.info('[MemberModule] Shutdown complete');
  }
}

/** Singleton instance */
export const memberModule = new MemberModule();
