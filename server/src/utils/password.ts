/**
 * Password hashing utilities using PBKDF2
 */

const ITERATIONS = 100000
const KEY_LENGTH = 64
const SALT_LENGTH = 16

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const salt = bufferToHex(saltBytes)
  const encoder = new TextEncoder()
  const keyBuffer = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyBuffer,
    KEY_LENGTH * 8,
  )
  return { hash: bufferToHex(derived), salt }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const saltBytes = hexToBuffer(salt)
  const encoder = new TextEncoder()
  const keyBuffer = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyBuffer,
    KEY_LENGTH * 8,
  )
  return bufferToHex(derived) === hash
}
