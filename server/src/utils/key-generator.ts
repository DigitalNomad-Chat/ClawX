/**
 * License Key Generator
 * Format: CLWX-XXXX-XXXX-XXXX
 */

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLicenseKey(): string {
  const segments: string[] = [];
  for (let s = 0; s < 3; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    segments.push(segment);
  }
  return `CLWX-${segments.join('-')}`;
}

export function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `srv_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
