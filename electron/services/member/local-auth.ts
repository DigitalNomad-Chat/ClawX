/**
 * Local Authentication Utilities
 * Password hashing with bcryptjs, JWT signing/verification with jsonwebtoken.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger';

const SALT_ROUNDS = 12;
const JWT_SECRET_FILENAME = 'member-jwt-secret.key';
const JWT_EXPIRES_IN = '7d';

let jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (jwtSecret) return jwtSecret;

  const secretPath = path.join(app.getPath('userData'), JWT_SECRET_FILENAME);

  try {
    if (fs.existsSync(secretPath)) {
      jwtSecret = fs.readFileSync(secretPath, 'utf8');
      return jwtSecret;
    }
  } catch {
    // fall through to generation
  }

  jwtSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretPath, jwtSecret, { mode: 0o600 });
  } catch (err) {
    logger.warn('[LocalAuth] Failed to persist JWT secret to disk:', err);
  }

  return jwtSecret;
}

export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext: string, hash: string): boolean {
  return bcrypt.compareSync(plaintext, hash);
}

export interface LocalJwtPayload {
  sub: string;
  username: string;
  email: string;
  tier: string;
  iat: number;
  exp: number;
}

export function signJwt(userId: string, username: string, email: string, tier: string): string {
  return jwt.sign(
    { sub: userId, username, email, tier },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN },
  );
}

export function verifyJwt(token: string): LocalJwtPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as LocalJwtPayload;
    return payload;
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): LocalJwtPayload | null {
  try {
    const payload = jwt.decode(token) as LocalJwtPayload | null;
    return payload;
  } catch {
    return null;
  }
}

export function generateId(): string {
  return `clw_${crypto.randomBytes(12).toString('hex')}`;
}

export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let s = 0; s < 3; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return `CLWX-${segments.join('-')}`;
}
