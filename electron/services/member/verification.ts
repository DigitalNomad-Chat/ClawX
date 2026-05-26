/**
 * Verification Service
 * Handles online License Key activation and periodic token refresh.
 * This is the ONLY component that makes network requests in the membership system.
 */
import { logger } from '../../utils/logger';
import type { Tier, VerificationResult, ActivationResult } from './types';

const VERIFICATION_BASE_URL = 'https://api.clawx.app/v1';

export const OFFLINE_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;
export const VERIFY_INTERVAL_MS = 8 * 60 * 60 * 1000;

export class VerificationService {
  private _lastVerifiedAt: number | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _running = false;

  async activateLicense(
    licenseKey: string,
    deviceId: string,
    userId?: string,
  ): Promise<ActivationResult> {
    try {
      const res = await fetch(`${VERIFICATION_BASE_URL}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          userId,
          clientType: 'clawx',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          reason: data.message || `Activation failed (${res.status})`,
        };
      }

      const data = await res.json();
      this._lastVerifiedAt = Date.now();

      return {
        success: true,
        tier: data.tier as Tier,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined,
      };
    } catch (err: any) {
      logger.error('[Verification] Activation error:', err);
      return { success: false, reason: 'Network error. Please check your connection.' };
    }
  }

  async verifyOnline(licenseKey: string, deviceId: string): Promise<VerificationResult> {
    try {
      const res = await fetch(`${VERIFICATION_BASE_URL}/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          clientType: 'clawx',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          reason: data.message || `Verification failed (${res.status})`,
        };
      }

      const data = await res.json();
      this._lastVerifiedAt = Date.now();

      return {
        success: true,
        tier: data.tier as Tier,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined,
        signature: data.signature as string,
      };
    } catch (err: any) {
      logger.error('[Verification] Online verify error:', err);
      return { success: false, reason: 'Network error' };
    }
  }

  isWithinGracePeriod(): boolean {
    if (!this._lastVerifiedAt) return false;
    return Date.now() - this._lastVerifiedAt < OFFLINE_GRACE_PERIOD_MS;
  }

  getLastVerifiedAt(): number | null {
    return this._lastVerifiedAt;
  }

  startPeriodicVerify(
    getLicenseKey: () => string | null,
    getDeviceId: () => string | null,
    onResult: (result: VerificationResult) => void,
  ): void {
    if (this._running) return;
    this._running = true;

    const tick = async () => {
      const key = getLicenseKey();
      const device = getDeviceId();
      if (key && device) {
        const result = await this.verifyOnline(key, device);
        onResult(result);
      }
      this._timer = setTimeout(tick, VERIFY_INTERVAL_MS);
      if (this._timer && typeof this._timer === 'object' && 'unref' in this._timer) {
        (this._timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    };

    this._timer = setTimeout(tick, VERIFY_INTERVAL_MS);
    if (this._timer && typeof this._timer === 'object' && 'unref' in this._timer) {
      (this._timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  stopPeriodicVerify(): void {
    this._running = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

export const verificationService = new VerificationService();
