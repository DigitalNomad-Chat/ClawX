/**
 * Admin users handlers: list, get, update
 * All require ADMIN_API_KEY Bearer token.
 */
import type { Env, DbUser, UpdateUserRequest } from '../types'
import { jsonResponse, errorResponse } from '../utils/response'

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth) return false
  const token = auth.replace('Bearer ', '').trim()
  return token === env.ADMIN_API_KEY
}

export async function handleAdminListUsers(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')
  const tier = url.searchParams.get('tier')
  const status = url.searchParams.get('status')

  let query = 'SELECT id, username, email, tier, status, balance, avatar_url, created_at, updated_at FROM users'
  const params: unknown[] = []
  const conditions: string[] = []

  if (tier) {
    conditions.push('tier = ?')
    params.push(tier)
  }
  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const { results } = await env.DB.prepare(query).bind(...params).all<{
    id: string
    username: string
    email: string
    tier: string
    status: string
    balance: number
    avatar_url: string | null
    created_at: number
    updated_at: number
  }>()

  let countQuery = 'SELECT COUNT(*) as total FROM users'
  const countParams: unknown[] = []
  if (conditions.length) {
    countQuery += ' WHERE ' + conditions.join(' AND ')
    countParams.push(...params.slice(0, -2))
  }

  const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>()

  return jsonResponse({
    users: results ?? [],
    total: countResult?.total ?? 0,
    limit,
    offset,
  })
}

export async function handleAdminGetUser(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const userId = url.pathname.split('/').pop() ?? ''

  const user = await env.DB.prepare(
    'SELECT id, username, email, tier, status, balance, avatar_url, created_at, updated_at FROM users WHERE id = ?',
  ).bind(userId).first<{
    id: string
    username: string
    email: string
    tier: string
    status: string
    balance: number
    avatar_url: string | null
    created_at: number
    updated_at: number
  }>()

  if (!user) {
    return errorResponse('User not found', 404)
  }

  return jsonResponse({ user })
}

export async function handleAdminUpdateUser(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) {
    return errorResponse('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const userId = url.pathname.split('/').pop() ?? ''

  let body: UpdateUserRequest
  try {
    body = await request.json() as UpdateUserRequest
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first<{ id: string }>()
  if (!user) {
    return errorResponse('User not found', 404)
  }

  const fields: string[] = []
  const params: unknown[] = []

  if (body.username !== undefined) {
    fields.push('username = ?')
    params.push(body.username)
  }
  if (body.email !== undefined) {
    fields.push('email = ?')
    params.push(body.email)
  }
  if (body.tier !== undefined) {
    fields.push('tier = ?')
    params.push(body.tier)
  }
  if (body.status !== undefined) {
    fields.push('status = ?')
    params.push(body.status)
  }
  if (body.balance !== undefined) {
    fields.push('balance = ?')
    params.push(body.balance)
  }
  if (body.avatarUrl !== undefined) {
    fields.push('avatar_url = ?')
    params.push(body.avatarUrl)
  }

  if (fields.length === 0) {
    return errorResponse('No fields to update')
  }

  const now = Math.floor(Date.now() / 1000)
  fields.push('updated_at = ?')
  params.push(now)
  params.push(userId)

  await env.DB.prepare(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
  ).bind(...params).run()

  return jsonResponse({ success: true, userId })
}
