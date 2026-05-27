/**
 * JWT sign/verify using Web Crypto (HMAC-SHA256)
 * No external dependencies.
 */

interface JwtPayload {
  sub: string
  username: string
  tier: string
  iat: number
  exp: number
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSeconds = 86400): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds }
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)))
  const signingInput = `${headerB64}.${payloadB64}`
  const key = await importKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  const signatureB64 = base64UrlEncode(signature)
  return `${headerB64}.${payloadB64}.${signatureB64}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  const encoder = new TextEncoder()
  const signingInput = `${headerB64}.${payloadB64}`
  const key = await importKey(secret)
  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signatureB64),
    encoder.encode(signingInput),
  )
  if (!signatureValid) return null
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64))
    const payload = JSON.parse(payloadJson) as JwtPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}
