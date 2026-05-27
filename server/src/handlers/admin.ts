/**
 * Admin endpoints for License Key management.
 * All require Bearer token authentication (ADMIN_API_KEY).
 */
import type { Env, DbLicense, CreateLicenseRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { generateLicenseKey, generateId } from '../utils/key-generator';

function authenticate(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === env.ADMIN_API_KEY;
}

/**
 * POST /v1/admin/licenses — Generate a new License Key
 */
export async function handleCreateLicense(request: Request, env: Env): Promise<Response> {
  if (!authenticate(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  let body: CreateLicenseRequest;
  try {
    body = await request.json() as CreateLicenseRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.tier || (body.tier !== 'pro' && body.tier !== 'enterprise')) {
    return errorResponse('Invalid tier. Must be "pro" or "enterprise"');
  }

  const now = Math.floor(Date.now() / 1000);
  const id = generateId();
  const licenseKey = generateLicenseKey();
  const durationDays = body.durationDays ?? 365;
  const maxDevices = body.maxDevices ?? (body.tier === 'enterprise' ? 5 : 2);

  await env.DB.prepare(
    `INSERT INTO licenses (id, license_key, tier, status, max_devices, duration_days, activated_count, created_at, updated_at, notes)
     VALUES (?, ?, ?, 'active', ?, ?, 0, ?, ?, ?)`,
  ).bind(id, licenseKey, body.tier, maxDevices, durationDays, now, now, body.notes ?? null).run();

  return jsonResponse({
    id,
    licenseKey,
    tier: body.tier,
    maxDevices,
    durationDays,
    createdAt: now,
  }, 201);
}

/**
 * GET /v1/admin/licenses — List all licenses
 */
export async function handleListLicenses(request: Request, env: Env): Promise<Response> {
  if (!authenticate(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM licenses';
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all<DbLicense>();

  // Get total count
  const countQuery = status ? 'SELECT COUNT(*) as total FROM licenses WHERE status = ?' : 'SELECT COUNT(*) as total FROM licenses';
  const countParams = status ? [status] : [];
  const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return jsonResponse({
    licenses: results,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
}

/**
 * DELETE /v1/admin/licenses/:key — Revoke a License Key
 */
export async function handleRevokeLicense(request: Request, env: Env, licenseKey: string): Promise<Response> {
  if (!authenticate(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const now = Math.floor(Date.now() / 1000);

  const result = await env.DB.prepare(
    "UPDATE licenses SET status = 'revoked', updated_at = ? WHERE license_key = ? AND status = 'active'",
  ).bind(now, licenseKey).run();

  if (!result.meta.changes) {
    return errorResponse('License not found or already revoked', 404);
  }

  // Also revoke all activations
  await env.DB.prepare(
    'UPDATE activations SET revoked = 1 WHERE license_key = ?',
  ).bind(licenseKey).run();

  return jsonResponse({ success: true, licenseKey });
}
