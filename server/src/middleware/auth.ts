/**
 * Auth middleware: extract Bearer token, verify JWT, check D1 session.
 */
import type { Env, AuthContext } from '../types'
import { verifyJwt } from '../utils/jwt'
import { hashToken } from '../utils/key-generator'

export async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  const auth = request.headers.get('Authorization')
  if (!auth) return null
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null

  const payload = await verifyJwt(token, env.JWT_SECRET)
  if (!payload) return null

  const tokenHash = await hashToken(token)
  const session = await env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?',
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{ user_id: string }>()

  if (!session) return null

  return {
    userId: payload.sub,
    username: payload.username,
    tier: payload.tier as AuthContext['tier'],
  }
}
