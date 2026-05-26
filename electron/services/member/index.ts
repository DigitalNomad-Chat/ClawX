/**
 * MemberModule Facade (Local-First)
 * Wires together local authentication, subscription, and usage tracking.
 */
import { machineId } from 'node-machine-id';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { MemberManager } from './member-manager';
import { TokenManager, tokenManager } from './token-manager';
import { UsageCounter, usageCounter } from './usage-counter';
import { NetworkDetector, networkDetector } from './network-detector';
import { memberEventBus } from './event-bus';
import { MemberEvent, type MemberState, type Feature, type UsageInfo } from './types';
import { logger } from '../../utils/logger';
import { initMemberDatabase } from './database';
import { getTierConfig } from './subscription';

async function generateDeviceId(): Promise<string> {
  const raw = await machineId();
  const plat = platform();
  return createHash('sha256').update(`${raw}:${plat}`).digest('hex');
}

export class MemberModule {
  readonly manager: MemberManager;
  readonly token: TokenManager;
  readonly usage: UsageCounter;
  readonly network: NetworkDetector;

  private _deviceId: string | null = null;
  private _initialized = false;

  constructor() {
    this.manager = new MemberManager();
    this.token = tokenManager;
    this.usage = usageCounter;
    this.network = networkDetector;
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    initMemberDatabase();

    // Migrate legacy data (one-time)
    try {
      const { migrateLegacyMemberData } = await import('./migrate');
      await migrateLegacyMemberData();
    } catch {
      // Ignore migration errors
    }

    this._deviceId = await generateDeviceId();

    await this.manager.init();
    await this.token.init();
    await this.usage.init();

    memberEventBus.on(MemberEvent.LOGIN_SUCCESS, () => {
      this._onLoginSuccess();
    });
    memberEventBus.on(MemberEvent.LOGOUT, () => {
      this.token.stopAutoRenewal();
    });

    this.network.start();

    this._initialized = true;
    logger.info('[MemberModule] Initialized (local-first mode)');
  }

  get state(): MemberState {
    return {
      ...this.manager.state,
      isOnline: this.network.isOnline,
      featureToken: this.token.getPayload(),
    };
  }

  get deviceId(): string | null {
    return this._deviceId;
  }

  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    const userId = this.manager.getUserId();
    if (!userId) {
      return null;
    }

    const userInfo = this.manager.state.userInfo;
    if (!userInfo) {
      return null;
    }

    const tier = userInfo.subscriptionTier ?? 'free';
    const config = getTierConfig(tier);
    const used = this.usage.getCount(userId, feature);
    const limit = config.monthlyQuota;
    const allowed = limit === 0 || used < limit;

    return {
      feature,
      used,
      limit,
      remaining: limit === 0 ? 999999 : Math.max(0, limit - used),
      tier,
      allowed,
    };
  }

  recordUsage(feature: Feature): void {
    const userId = this.manager.getUserId();
    if (!userId) return;
    this.usage.increment(userId, feature);
  }

  async shutdown(): Promise<void> {
    this.network.stop();
    this.token.stopAutoRenewal();
    this._initialized = false;
    logger.info('[MemberModule] Shutdown complete');
  }

  private _onLoginSuccess(): void {
    const userInfo = this.manager.state.userInfo;
    const jwt = this.manager.getJwtToken();
    if (!userInfo || !jwt || !this._deviceId) return;

    try {
      this.token.issueToken(
        userInfo.id,
        userInfo.username,
        userInfo.email,
        userInfo.subscriptionTier,
        this._deviceId,
        (feature) => this.usage.getCount(userInfo.id, feature),
      );
      this.token.startAutoRenewal(
        () => this.manager.state.userInfo,
        () => this._deviceId,
        (feature) => this.usage.getCount(userInfo.id, feature),
      );
    } catch (err) {
      logger.warn('[MemberModule] Failed to issue token after login:', err);
    }
  }
}

export const memberModule = new MemberModule();
