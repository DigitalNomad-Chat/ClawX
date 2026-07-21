import { describe, expect, it } from 'vitest';
import { hostApi } from '@/lib/host-api';
import enSetup from '@/i18n/locales/en/setup.json';
import zhSetup from '@/i18n/locales/zh/setup.json';
import jaSetup from '@/i18n/locales/ja/setup.json';
import ruSetup from '@/i18n/locales/ru/setup.json';
import enSettings from '@/i18n/locales/en/settings.json';

function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  function walk(v: unknown) {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  }
  walk(value);
  return out;
}

describe('Hermes product removal regression', () => {
  it('hostApi.app does not expose a hermesStatus action', () => {
    expect(hostApi.app).toBeDefined();
    expect('hermesStatus' in hostApi.app).toBe(false);
  });

  it('setup translations no longer mention Hermes/hermes', () => {
    const locales = { en: enSetup, zh: zhSetup, ja: jaSetup, ru: ruSetup };
    for (const [name, locale] of Object.entries(locales)) {
      const text = collectStrings(locale).join(' ');
      expect(text, `Hermes found in ${name}/setup.json`).not.toMatch(/Hermes/);
      expect(text, `hermes found in ${name}/setup.json`).not.toMatch(/hermes/);
    }
  });

  it('settings translations use OpenClaw wording for the about section', () => {
    expect(enSettings.about.basedOn).toMatch(/OpenClaw/);
    expect(enSettings.about.basedOn).not.toMatch(/Hermes/);
  });
});
