/**
 * MemberModule Facade (Cloud-First)
 * Lightweight proxy that delegates all membership operations to the cloud API.
 */
import { machineId } from 'node-machine-id';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { cloudApiClient, CloudApiClient } from './cloud-api-client';
import { NetworkDetector, networkDetector } from './network-detector';
import { memberEventBus } from './event-bus';
import { MemberEvent, type MemberState, type Feature, type UsageInfo } from './types';
import { logger } from '../../utils/logger';
import { cleanupLegacyLocalData } from './local-cleanup';

async function generateDeviceId(): Promise<string> {
  const raw = await machineId();
  const plat = platform();
  return createHash('sha256').update(`${raw}:${plat}`).digest('hex');
}

export class MemberModule {
  readonly client: CloudApiClient;
  readonly network: NetworkDetector;

  private _deviceId: string | null = null;
  private _initialized = false;

  constructor() {
    this.client = cloudApiClient;
    this.network = networkDetector;
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    // Clean up legacy local SQLite data (one-time)
    await cleanupLegacyLocalData();

    this._deviceId = await generateDeviceId();

    // Initialize cloud API client (restores token, validates session)
    await this.client.init();

    this.network.start();

    this._initialized = true;
    logger.info('[MemberModule] Initialized (cloud-first mode)');
  }

  get state(): MemberState {
    return {
      isLoggedIn: this.client.isLoggedIn,
      isGuest: !this.client.isLoggedIn,
      userInfo: this.client.userInfo,
      tier: this.client.userInfo?.subscriptionTier ?? null,
      isOnline: this.network.isOnline,
    };
  }

  get deviceId(): string | null {
    return this._deviceId;
  }

  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    if (!this.client.isLoggedIn) return null;
    return this.client.checkFeature(feature);
  }

  async recordUsage(feature: Feature): Promise<void> {
    if (!this.client.isLoggedIn) return;
    await this.client.recordUsage(feature);
  }

  async shutdown(): Promise<void> {
    this.network.stop();
    this._initialized = false;
    logger.info('[MemberModule] Shutdown complete');
  }
}

export const memberModule = new MemberModule();
