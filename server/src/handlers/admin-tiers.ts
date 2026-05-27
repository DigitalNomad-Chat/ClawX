/**
 * Admin tier config handlers: list, update
 * All require ADMIN_API_KEY Bearer token.
 */
import type { Env, DbTierConfig, UpdateTierRequest } from '../types'
import { jsonResponse, errorResponse } from '../utils/response'

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth) return false
  const token = auth.replace('Bearer ', '').trim()
  return token === env.ADMIN_API_KEY
}

export async function handleAdminListTiers(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM tier_config ORDER BY tier ASC',
  ).all<DbTierConfig>()

  const tiers = (results ?? []).map((t) => ({
    ...t,
    features: JSON.parse(t.features) as string[],
  }))

  return jsonResponse({ tiers })
}

export async function handleAdminUpdateTier(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const tierName = url.pathname.split('/').pop() ?? ''

  let body: UpdateTierRequest
  try {
    body = await request.json() as UpdateTierRequest
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  if (!tierName) {
    return errorResponse('Missing tier name')
  }

  const tier = await env.DB.prepare('SELECT tier FROM tier_config WHERE tier = ?').bind(tierName).first<{ tier: string }>()
  if (!tier) {
    return errorResponse('Tier not found', 404)
  }

  const fields: string[] = []
  const params: unknown[] = []

  if (body.displayName !== undefined) {
    fields.push('display_name = ?')
    params.push(body.displayName)
  }
  if (body.monthlyQuota !== undefined) {
    fields.push('monthly_quota = ?')
    params.push(body.monthlyQuota)
  }
  if (body.features !== undefined) {
    fields.push('features = ?')
    params.push(JSON.stringify(body.features))
  }
  if (body.maxDevices !== undefined) {
    fields.push('max_devices = ?')
    params.push(body.maxDevices)
  }

  if (fields.length === 0) {
    return errorResponse('No fields to update')
  }

  const now = Math.floor(Date.now() / 1000)
  fields.push('updated_at = ?')
  params.push(now)
  params.push(tierName)

  await env.DB.prepare(
    `UPDATE tier_config SET ${fields.join(', ')} WHERE tier = ?`,
  ).bind(...params).run()

  return jsonResponse({ success: true, tier: tierName })
}
