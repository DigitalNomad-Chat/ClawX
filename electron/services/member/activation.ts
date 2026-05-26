/**
 * Activation Service
 * Bridges License Key input → online verification → local subscription activation.
 */
import { getMemberDatabase } from './database';
import { verificationService } from './verification';
import { generateId } from './local-auth';
import type { ActivationResult, Tier } from './types';
import { logger } from '../../utils/logger';

export class ActivationService {
  async activate(
    userId: string,
    licenseKey: string,
    deviceId: string,
  ): Promise<ActivationResult> {
    try {
      const db = getMemberDatabase();

      const result = await verificationService.activateLicense(licenseKey, deviceId, userId);
      if (!result.success) {
        return result;
      }

      const tier = result.tier ?? 'free';
      const now = Date.now();
      const expiresAt = result.expiresAt ?? null;

      const existing = db
        .prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1")
        .get(userId) as { id: string } | undefined;

      if (existing) {
        db.prepare(
          `UPDATE subscriptions
           SET tier = ?, status = 'active', expires_at = ?, activated_by = ?,
               last_verified_at = ?, updated_at = ?
           WHERE id = ?`,
        ).run(tier, expiresAt, licenseKey, now, now, existing.id);
      } else {
        const subId = generateId();
        db.prepare(
          `INSERT INTO subscriptions
             (id, user_id, tier, status, started_at, expires_at, activated_by,
              last_verified_at, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
        ).run(subId, userId, tier, now, expiresAt, licenseKey, now, now, now);
      }

      const activationId = generateId();
      db.prepare(
        `INSERT INTO activations
           (id, user_id, license_key, device_fingerprint, tier, activated_at,
            expires_at, last_verified_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(license_key)
         DO UPDATE SET
           user_id = excluded.user_id,
           device_fingerprint = excluded.device_fingerprint,
           tier = excluded.tier,
           activated_at = excluded.activated_at,
           expires_at = excluded.expires_at,
           last_verified_at = excluded.last_verified_at,
           revoked = 0`,
      ).run(activationId, userId, licenseKey, deviceId, tier, now, expiresAt, now);

      logger.info(`[Activation] License activated for user ${userId}, tier: ${tier}`);
      return { success: true, tier, expiresAt: expiresAt ?? undefined };
    } catch (err: any) {
      logger.error('[Activation] Error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  }

  getActivationForUser(userId: string): {
    licenseKey: string;
    tier: Tier;
    expiresAt: number | null;
    lastVerifiedAt: number | null;
  } | null {
    const db = getMemberDatabase();
    const row = db
      .prepare(
        'SELECT license_key, tier, expires_at, last_verified_at FROM activations WHERE user_id = ? AND revoked = 0 ORDER BY activated_at DESC LIMIT 1',
      )
      .get(userId) as
      | {
          license_key: string;
          tier: Tier;
          expires_at: number | null;
          last_verified_at: number | null;
        }
      | undefined;

    if (!row) return null;
    return {
      licenseKey: row.license_key,
      tier: row.tier,
      expiresAt: row.expires_at,
      lastVerifiedAt: row.last_verified_at,
    };
  }
}

export const activationService = new ActivationService();
