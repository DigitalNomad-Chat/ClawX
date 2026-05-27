/**
 * POST /v1/license/activate
 * Activates a License Key on a specific device.
 */
import type { Env, DbLicense, DbActivation, ActivateRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { generateId } from '../utils/key-generator';
import { authenticate } from '../middleware/auth';

export async function handleActivate(request: Request, env: Env): Promise<Response> {
  let body: ActivateRequest;
  try {
    body = await request.json() as ActivateRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { licenseKey, deviceId } = body;

  if (!licenseKey || !deviceId) {
    return errorResponse('Missing required fields: licenseKey, deviceId');
  }

  // Try Bearer token auth first, fallback to body.userId
  const authCtx = await authenticate(request, env);
  const userId = authCtx ? authCtx.userId : body.userId;

  // Lookup license
  const license = await env.DB.prepare(
    'SELECT * FROM licenses WHERE license_key = ? AND status = ?',
  ).bind(licenseKey, 'active').first<DbLicense>();

  if (!license) {
    return errorResponse('Invalid or inactive license key', 404);
  }

  // Check device limit
  const existingActivations = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM activations WHERE license_key = ? AND revoked = 0',
  ).bind(licenseKey).first<{ cnt: number }>();

  const deviceCount = existingActivations?.cnt ?? 0;

  // Check if this device is already activated
  const existingForDevice = await env.DB.prepare(
    'SELECT * FROM activations WHERE license_key = ? AND device_fingerprint = ? AND revoked = 0',
  ).bind(licenseKey, deviceId).first<DbActivation>();

  if (!existingForDevice && deviceCount >= license.max_devices) {
    return errorResponse(`Device limit reached (${license.max_devices}). Please deactivate a device first.`, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (license.duration_days * 86400);

  if (existingForDevice) {
    // Re-activate existing device (update verification time)
    await env.DB.prepare(
      `UPDATE activations
       SET last_verified_at = ?, expires_at = ?, user_id = ?
       WHERE id = ?`,
    ).bind(now, expiresAt, userId ?? null, existingForDevice.id).run();
  } else {
    // New device activation
    const activationId = generateId();
    await env.DB.prepare(
      `INSERT INTO activations (id, license_key, device_fingerprint, user_id, tier, activated_at, expires_at, last_verified_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(activationId, licenseKey, deviceId, userId ?? null, license.tier, now, expiresAt, now).run();

    // Increment activated count on license
    await env.DB.prepare(
      'UPDATE licenses SET activated_count = activated_count + 1, updated_at = ? WHERE id = ?',
    ).bind(now, license.id).run();
  }

  return jsonResponse({
    tier: license.tier,
    expiresAt,
  });
}
