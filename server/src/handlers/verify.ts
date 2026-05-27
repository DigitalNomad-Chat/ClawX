/**
 * POST /v1/license/verify
 * Verifies a License Key is still valid for a given device.
 */
import type { Env, DbActivation, VerifyRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  let body: VerifyRequest;
  try {
    body = await request.json() as VerifyRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { licenseKey, deviceId } = body;

  if (!licenseKey || !deviceId) {
    return errorResponse('Missing required fields: licenseKey, deviceId');
  }

  // Lookup activation for this key + device
  const activation = await env.DB.prepare(
    `SELECT a.*, l.status as license_status, l.tier as license_tier
     FROM activations a
     JOIN licenses l ON a.license_key = l.license_key
     WHERE a.license_key = ? AND a.device_fingerprint = ? AND a.revoked = 0`,
  ).bind(licenseKey, deviceId).first<DbActivation & { license_status: string; license_tier: string }>();

  if (!activation) {
    return errorResponse('No active activation found for this key and device', 404);
  }

  if (activation.license_status !== 'active') {
    return errorResponse('License has been revoked or expired', 403);
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (activation.expires_at && activation.expires_at <= now) {
    return errorResponse('License activation has expired', 403);
  }

  // Update last_verified_at
  await env.DB.prepare(
    'UPDATE activations SET last_verified_at = ? WHERE id = ?',
  ).bind(now, activation.id).run();

  // Generate a simple verification signature
  // In production, use HMAC with a server-side secret
  const signature = await generateVerificationSignature(licenseKey, deviceId, activation.tier, env);

  return jsonResponse({
    tier: activation.tier,
    expiresAt: activation.expires_at,
    signature,
  });
}

async function generateVerificationSignature(
  licenseKey: string,
  deviceId: string,
  tier: string,
  env: Env,
): Promise<string> {
  const data = `${licenseKey}:${deviceId}:${tier}:${Math.floor(Date.now() / 1000)}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.ADMIN_API_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
