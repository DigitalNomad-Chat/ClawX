/**
 * Usage handlers: check, record, stats
 */
import type { Env, RecordUsageRequest } from '../types'
import { jsonResponse, errorResponse } from '../utils/response'
import { authenticate } from '../middleware/auth'

export async function handleUsageCheck(request: Request, env: Env): Promise<Response> {
  const authCtx = await authenticate(request, env)
  if (!authCtx) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const feature = url.searchParams.get('feature')
  if (!feature) {
    return errorResponse('Missing feature query parameter')
  }

  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const tierConfig = await env.DB.prepare(
    'SELECT * FROM tier_config WHERE tier = ?',
  ).bind(authCtx.tier).first<{ monthly_quota: number; features: string }>()

  const usage = await env.DB.prepare(
    'SELECT used_count FROM usage WHERE user_id = ? AND feature = ? AND year_month = ?',
  ).bind(authCtx.userId, feature, yearMonth).first<{ used_count: number }>()

  const usedCount = usage?.used_count ?? 0
  const monthlyQuota = tierConfig?.monthly_quota ?? 0
  const features: string[] = tierConfig ? JSON.parse(tierConfig.features) : []
  const hasFeature = features.includes(feature)

  return jsonResponse({
    feature,
    yearMonth,
    usedCount,
    monthlyQuota,
    hasFeature,
    unlimited: monthlyQuota === 0,
    remaining: monthlyQuota === 0 ? null : Math.max(0, monthlyQuota - usedCount),
  })
}

export async function handleUsageRecord(request: Request, env: Env): Promise<Response> {
  const authCtx = await authenticate(request, env)
  if (!authCtx) {
    return errorResponse('Unauthorized', 401)
  }

  let body: RecordUsageRequest
  try {
    body = await request.json() as RecordUsageRequest
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { feature } = body
  if (!feature) {
    return errorResponse('Missing required field: feature')
  }

  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  await env.DB.prepare(
    `INSERT INTO usage (user_id, feature, year_month, used_count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, feature, year_month) DO UPDATE SET used_count = used_count + 1`,
  ).bind(authCtx.userId, feature, yearMonth).run()

  return jsonResponse({ success: true, feature, yearMonth })
}

export async function handleUsageStats(request: Request, env: Env): Promise<Response> {
  const authCtx = await authenticate(request, env)
  if (!authCtx) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const yearMonth = url.searchParams.get('yearMonth')

  let query = 'SELECT feature, year_month, used_count FROM usage WHERE user_id = ?'
  const params: unknown[] = [authCtx.userId]

  if (yearMonth) {
    query += ' AND year_month = ?'
    params.push(yearMonth)
  }

  query += ' ORDER BY year_month DESC, feature ASC'

  const { results } = await env.DB.prepare(query).bind(...params).all<{
    feature: string
    year_month: string
    used_count: number
  }>()

  return jsonResponse({
    stats: results ?? [],
  })
}
