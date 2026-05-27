/**
 * Auth handlers: register, login, logout, me
 */
import type { Env, DbUser, RegisterRequest, LoginRequest, AuthContext } from '../types'
import { jsonResponse, errorResponse } from '../utils/response'
import { generateId, hashToken } from '../utils/key-generator'
import { hashPassword, verifyPassword } from '../utils/password'
import { signJwt } from '../utils/jwt'
import { authenticate } from '../middleware/auth'

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: RegisterRequest
  try {
    body = await request.json() as RegisterRequest
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { username, email, password, deviceId } = body
  if (!username || !email || !password) {
    return errorResponse('Missing required fields: username, email, password')
  }

  if (password.length < 6) {
    return errorResponse('Password must be at least 6 characters')
  }

  const now = Math.floor(Date.now() / 1000)

  // Check uniqueness
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?',
  ).bind(username, email).first<{ id: string }>()

  if (existingUser) {
    return errorResponse('Username or email already exists', 409)
  }

  const { hash, salt } = await hashPassword(password)
  const userId = generateId()

  await env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, password_salt, avatar_url, tier, balance, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'free', 0, 'active', ?, ?)`,
  ).bind(userId, username, email, hash, salt, null, now, now).run()

  const token = await signJwt({ sub: userId, username, tier: 'free' }, env.JWT_SECRET, 86400 * 7)
  const tokenHash = await hashToken(token)
  const sessionId = generateId()

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, userId, deviceId ?? null, tokenHash, now, now + 86400 * 7).run()

  return jsonResponse({
    success: true,
    user: {
      id: userId,
      username,
      email,
      tier: 'free',
      status: 'active',
      balance: 0,
    },
    token,
  }, 201)
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginRequest
  try {
    body = await request.json() as LoginRequest
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { usernameOrEmail, password, deviceId } = body
  if (!usernameOrEmail || !password) {
    return errorResponse('Missing required fields: usernameOrEmail, password')
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE username = ? OR email = ?',
  ).bind(usernameOrEmail, usernameOrEmail).first<DbUser>()

  if (!user) {
    return errorResponse('Invalid credentials', 401)
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt)
  if (!valid) {
    return errorResponse('Invalid credentials', 401)
  }

  if (user.status !== 'active') {
    return errorResponse('Account is not active', 403)
  }

  const now = Math.floor(Date.now() / 1000)
  const token = await signJwt({ sub: user.id, username: user.username, tier: user.tier }, env.JWT_SECRET, 86400 * 7)
  const tokenHash = await hashToken(token)
  const sessionId = generateId()

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, user.id, deviceId ?? null, tokenHash, now, now + 86400 * 7).run()

  return jsonResponse({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      tier: user.tier,
      status: user.status,
      balance: user.balance,
      avatarUrl: user.avatar_url,
    },
    token,
  })
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return errorResponse('Unauthorized', 401)
  }

  const token = auth.replace('Bearer ', '').trim()
  const tokenHash = await hashToken(token)

  await env.DB.prepare(
    'DELETE FROM sessions WHERE token_hash = ?',
  ).bind(tokenHash).run()

  return jsonResponse({ success: true })
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const authCtx = await authenticate(request, env)
  if (!authCtx) {
    return errorResponse('Unauthorized', 401)
  }

  const user = await env.DB.prepare(
    'SELECT id, username, email, tier, status, balance, avatar_url, created_at FROM users WHERE id = ?',
  ).bind(authCtx.userId).first<{
    id: string
    username: string
    email: string
    tier: string
    status: string
    balance: number
    avatar_url: string | null
    created_at: number
  }>()

  if (!user) {
    return errorResponse('User not found', 404)
  }

  return jsonResponse({
    id: user.id,
    username: user.username,
    email: user.email,
    tier: user.tier,
    status: user.status,
    balance: user.balance,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  })
}
