import { Injectable } from '@nestjs/common';
import * as svgCaptcha from 'svg-captcha';

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class CaptchaService {
  private store = new Map<string, CaptchaEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  generate(): { captchaId: string; svg: string } {
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 3,
      color: true,
      background: '#f0f4f8',
      width: 120,
      height: 40,
      fontSize: 36,
      charPreset: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    });

    const captchaId = this.randomId();
    this.store.set(captchaId, {
      code: captcha.text.toLowerCase(),
      expiresAt: Date.now() + this.TTL_MS,
    });

    return { captchaId, svg: captcha.data };
  }

  verify(captchaId: string, inputCode: string): boolean {
    if (!captchaId || !inputCode) return false;

    const entry = this.store.get(captchaId);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(captchaId);
      return false;
    }

    const valid = entry.code === inputCode.toLowerCase();
    // One-time use
    this.store.delete(captchaId);
    return valid;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(id);
      }
    }
  }

  private randomId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
