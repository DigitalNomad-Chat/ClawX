export interface SensitiveMap {
  [placeholder: string]: string;
}

export interface DesensitizeResult {
  text: string;
  map: SensitiveMap;
}

export function restoreText(text: string, map: SensitiveMap): string {
  if (!map || Object.keys(map).length === 0) return text;
  let result = text;
  for (const [placeholder, original] of Object.entries(map)) {
    result = result.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      original,
    );
  }
  return result;
}

export function markSensitive(
  text: string,
  existingMap: SensitiveMap,
  selection: string,
  type: string,
): { text: string; map: SensitiveMap } {
  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;
  const idx = text.indexOf(selection);
  if (idx === -1) return { text, map: existingMap };

  const newText = text.slice(0, idx) + placeholder + text.slice(idx + selection.length);
  const newMap = { ...existingMap, [placeholder]: selection };
  return { text: newText, map: newMap };
}

export function hasPlaceholders(text: string): boolean {
  return /__PII_\w+_\d{8}__/.test(text);
}

export function getPlaceholderTypes(text: string): string[] {
  const types = new Set<string>();
  const regex = /__PII_(\w+)_\d{8}__/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    types.add(match[1]);
  }
  return Array.from(types);
}

export function formatPlaceholderType(type: string): string {
  const labels: Record<string, string> = {
    ID_CARD: '身份证',
    HKID: '香港身份证',
    TAIWAN_ID: '台湾身份证',
    MACAU_ID: '澳门身份证',
    HOME_RETURN_PERMIT: '回乡证',
    TAIWAN_COMPATRIOT_PERMIT: '台胞证',
    PHONE: '手机号',
    PHONE_HK: '香港手机号',
    PHONE_TW: '台湾手机号',
    PHONE_MO: '澳门手机号',
    EMAIL: '邮箱',
    PASSPORT: '护照号',
    NAME: '姓名',
    BANK_CARD: '银行卡号',
    IBAN: 'IBAN',
    SWIFT: 'SWIFT',
    CREDIT_CARD: '信用卡号',
    POLICY_NUMBER: '保单号',
    FUND_ACCOUNT: '基金账号',
    STOCK_ACCOUNT: '证券账号',
    SOCIAL_SECURITY: '社保/公积金号',
    ADDRESS: '地址',
  };
  return labels[type] || type;
}
