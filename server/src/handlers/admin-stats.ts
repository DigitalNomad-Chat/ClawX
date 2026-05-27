/**
 * Admin dashboard stats handler
 * Requires ADMIN_API_KEY Bearer token.
 */
import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../utils/response'

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth) return false
  const token = auth.replace('Bearer ', '').trim()
  return token === env.ADMIN_API_KEY
}

export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const totalUsersResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM users',
  ).first<{ total: number }>()

  const activeUsersResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM users WHERE status = 'active'",
  ).first<{ total: number }>()

  const totalLicensesResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM licenses',
  ).first<{ total: number }>()

  const tierDistributionResult = await env.DB.prepare(
    'SELECT tier, COUNT(*) as count FROM users GROUP BY tier',
  ).all<{ tier: string; count: number }>()

  const recentRegistrationsResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM users WHERE created_at > ? AND status = 'active'",
  ).bind(Math.floor(Date.now() / 1000) - 7 * 86400).first<{ total: number }>()

  return jsonResponse({
    totalUsers: totalUsersResult?.total ?? 0,
    activeUsers: activeUsersResult?.total ?? 0,
    totalLicenses: totalLicensesResult?.total ?? 0,
    tierDistribution: tierDistributionResult.results ?? [],
    recentRegistrations: recentRegistrationsResult?.total ?? 0,
  })
}
