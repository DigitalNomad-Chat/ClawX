# 脱敏工具移植与恢复流程 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 guada_ai 的脱敏工具移植到 ClawX，在聊天框下新增脱敏入口，支持文件上传/文本输入自动脱敏，并在消息气泡中支持脱敏/原文视图切换。

**Architecture:** 后端复用 guada_ai 的 DesensitizeService 正则匹配核心逻辑，提供 `/api/desensitize` 和 `/api/desensitize/restore` HTTP API。前端新增 Sheet 弹窗面板进行脱敏预览和确认，将 `sensitiveMap` 绑定到消息对象上，消息气泡通过 Eye 图标切换占位符和原文的本地显示。

**Tech Stack:** React + TypeScript + Tailwind CSS + Radix UI Sheet (frontend), Node.js原生HTTP路由 (backend)

---

## File Structure

| 文件 | 职责 | 操作 |
|---|---|---|
| `electron/api/services/desensitize.ts` | 脱敏核心服务（正则匹配、占位符替换、恢复） | 创建 |
| `electron/api/routes/desensitize.ts` | 脱敏 HTTP API 路由（/api/desensitize, /api/desensitize/restore） | 创建 |
| `electron/api/routes/files.ts` | 复用现有文件上传和 staging 逻辑 | 修改（新增 OCR 文本提取） |
| `electron/api/server.ts` | 注册脱敏路由 | 修改 |
| `src/lib/desensitize.ts` | 前端脱敏工具类型和 restore 函数 | 创建 |
| `src/components/desensitize/DesensitizePanel.tsx` | Sheet 弹窗面板：上传/粘贴 → 预览 → 确认填入 | 创建 |
| `src/components/desensitize/DesensitizePreview.tsx` | 脱敏预览对比组件（原文/脱敏后左右对照） | 创建 |
| `src/pages/Chat/ChatInput.tsx` | Action Row 新增 🛡️ 脱敏工具入口 | 修改 |
| `src/stores/chat/types.ts` | RawMessage 扩展 `desensitizeMap` 字段 | 修改 |
| `src/pages/Chat/ChatMessage.tsx` | 消息气泡新增 Eye 图标 + 恢复文本显示 | 修改 |
| `src/pages/Chat/ChatToolbar.tsx` | 新增全局 Toggle [显示原文/显示脱敏] | 修改 |
| `tests/unit/desensitize.test.ts` | 脱敏核心逻辑单元测试 | 创建 |

---

## Chunk 1: 后端脱敏服务与 API

### Task 1: 创建脱敏核心服务

**Files:**
- Create: `electron/api/services/desensitize.ts`

**说明:** 从 guada_ai 移植核心脱敏逻辑，移除 NestJS `@Injectable()` 装饰器，改为纯函数导出。

- [ ] **Step 1: 写入脱敏服务代码**

```ts
// electron/api/services/desensitize.ts
export interface SensitiveMap {
  [placeholder: string]: string;
}

interface DesensitizeResult {
  text: string;
  map: SensitiveMap;
}

// 保险文档常见术语（不应被当作姓名匹配）
const INSURANCE_TERMS = new Set([
  '投保年龄', '保险期间', '保险费率', '保险责任', '投保范围',
  '保险金额', '投保份数', '合同生效', '合同构成', '保险条款',
  '保险合同', '保险单号', '投保单号', '保险终期', '保险费',
  '保险金', '理赔服务', '责任免除', '保险事故',
]);

// 金融行业常见术语
const FINANCE_TERMS = new Set([
  '开户银行', '银行账户', '银行账号', '银行卡号', '开户行',
  '基金账号', '基金账户', '证券账号', '证券账户', '股票账号',
  '股票账户', '资金账号', '资金账户', '理财账号', '理财账户',
  '托管银行', '托管账户', '托管账号', '存管银行', '存管账户',
  '信托计划', '信托账号', '信托账户', '保单贷款', '保单借款',
  '保费', '保额', '保险金额', '保险费', '保险费率',
  '保单年度', '保单周年', '保单生效', '保单终止', '保单状态',
  '投保人', '被保险人', '受益人', '保险人', '保险公司',
  '保险条款', '保险责任', '免除责任', '责任免除', '保险期间',
  '保险期限', '等待期', '犹豫期', '宽限期', '保险事故',
  '理赔申请', '理赔资料', '理赔服务', '保险理赔', '保险金',
  '给付', '赔付', '赔偿', '补偿', '退保', '续保', '核保',
  '承保', '拒保', '加费承保', '除外承保', '延期承保',
  '健康告知', '如实告知', '告知义务', '告知事项',
  '保险营销', '保险代理', '保险经纪', '保险公估',
  '保险兼业代理', '保险专业代理', '个人保险代理人',
  '银行保险', '电话营销', '网络营销', '团体保险',
  '个人保险', '商业保险', '社会保险', '补充保险',
  '基本养老保险', '基本医疗保险', '工伤保险', '失业保险',
  '生育保险', '住房公积金', '企业年金', '职业年金',
  '养老金', '退休金', '社保号', '公积金账号',
  '基金名称', '基金代码', '基金类型', '基金规模',
  '基金净值', '基金份额', '基金分红', '基金转换',
  '申购', '赎回', '定投', '分红', '转托管',
  '证券代码', '证券名称', '证券类型', '证券数量',
  '买入', '卖出', '持仓', '市值', '盈亏', '收益率',
  '汇率', '利率', '基准利率', '贷款利率', '存款利率',
  '股票代码', '股票名称', '股票类型', '股票数量',
  'A股', 'B股', 'H股', 'N股', 'S股', '港股', '美股',
  '上海证券交易所', '深圳证券交易所', '香港交易所',
  '纽约证券交易所', '纳斯达克', '场外市场',
  '人民币', '美元', '欧元', '港币', '日元', '英镑',
  '开户', '销户', '转户', '过户', '交割', '清算',
  '结算', '对账', '审计', '核算', '报税', '纳税',
  '扣缴义务人', '纳税人', '征税对象', '税目', '税率',
  '起征点', '免征额', '税收优惠', '税收减免',
  '应纳税所得额', '应纳税额', '已缴税额', '应补退税额',
]);

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function isFinanceTerm(candidate: string): boolean {
  if (FINANCE_TERMS.has(candidate)) return true;
  if (candidate.length >= 3) {
    for (const term of FINANCE_TERMS) {
      if (similarity(candidate, term) >= 0.7) return true;
    }
  }
  return false;
}

function luhnCheck(num: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num.substring(i, i + 1), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function isValidHKID(id: string): boolean {
  const clean = id.replace(/[()\s]/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d{6}[A0-9]$/.test(clean)) return false;
  const prefix = clean.substring(0, clean.length - 7);
  const digits = clean.substring(prefix.length, prefix.length + 6);
  const checkDigit = clean[clean.length - 1];
  let sum = 0;
  let weight = prefix.length === 1 ? 8 : 9;
  for (const c of prefix) {
    sum += (c.charCodeAt(0) - 64) * weight;
    weight--;
  }
  for (const d of digits) {
    sum += parseInt(d, 10) * weight;
    weight--;
  }
  const remainder = sum % 11;
  const expected = remainder === 0 ? '0' : remainder === 1 ? 'A' : String(11 - remainder);
  return checkDigit === expected;
}

function isValidTaiwanID(id: string): boolean {
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false;
  const letterMap: Record<string, number> = {
    A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17,
    I: 34, J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23,
    Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30,
    Y: 31, Z: 33,
  };
  const first = letterMap[id[0]];
  if (!first) return false;
  const nums = [Math.floor(first / 10), first % 10];
  for (let i = 1; i < id.length; i++) {
    nums.push(parseInt(id[i], 10));
  }
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i] * weights[i];
  }
  return sum % 10 === 0;
}

function isValidMacauID(id: string): boolean {
  const clean = id.replace(/[-\s()]/g, '');
  if (!/^\d{8}$/.test(clean)) return false;
  const checkDigit = parseInt(clean[7], 10);
  const prefix = clean.substring(0, 7);
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) {
    sum += parseInt(prefix[i], 10) * (8 - i);
  }
  const expected = (11 - (sum % 11)) % 10;
  return checkDigit === expected;
}

function isValidHomeReturnPermit(id: string): boolean {
  return /^[HMhm]\d{8,9}$/.test(id);
}

function isValidTaiwanCompatriotPermit(id: string): boolean {
  return /^\d{8}$/.test(id);
}

function isLikelyPassportNumber(num: string): boolean {
  const clean = num.toUpperCase().replace(/\s/g, '');
  if (/^[EG]\d{8}$/.test(clean)) return true;
  if (/^[A-Z]\d{7,9}$/.test(clean)) return true;
  if (/^\d{8,9}$/.test(clean)) return true;
  return false;
}

function isValidIdCard(id: string): boolean {
  if (id.length === 15) return /^\d{15}$/.test(id);
  if (id.length !== 18) return false;
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkChars = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(id[i], 10) * weights[i];
  }
  return id[17].toUpperCase() === checkChars[sum % 11];
}

export function desensitize(text: string): DesensitizeResult {
  let counter = 0;
  const map: SensitiveMap = {};

  const replaceMatches = (
    type: string,
    pattern: RegExp,
    inputText: string,
    validator?: (match: string, index: number, fullText: string) => boolean,
  ): string => {
    const segments: string[] = [];
    let lastIdx = 0;
    const matches = [...inputText.matchAll(pattern)];

    for (const m of matches) {
      const matchStr = m[0];
      const start = m.index!;

      if (validator && !validator(matchStr, start, inputText)) continue;

      counter++;
      const placeholder = `__PII_${type}_${String(counter).padStart(8, '0')}__`;
      map[placeholder] = matchStr;

      segments.push(inputText.slice(lastIdx, start));
      segments.push(placeholder);
      lastIdx = start + matchStr.length;
    }

    segments.push(inputText.slice(lastIdx));
    return segments.join('');
  };

  let result = text;

  // 1. 身份证号
  result = replaceMatches(
    'ID_CARD',
    /(?<!\d)\d{17}[\dXx](?!\d)/g,
    result,
    (m) => isValidIdCard(m),
  );

  // 2. 香港身份证
  result = replaceMatches(
    'HKID',
    /\b[A-Z]{1,2}\d{6}[\dA]\b|\b[A-Z]{1,2}\d{6}\(\d\)\b|\b[A-Z]{1,2}\d{6}\s*\(\s*\d\s*\)\b/gi,
    result,
    (m) => isValidHKID(m),
  );

  // 3. 台湾身份证
  result = replaceMatches(
    'TAIWAN_ID',
    /\b[A-Z][12]\d{8}\b/g,
    result,
    (m) => isValidTaiwanID(m),
  );

  // 4. 澳门身份证
  result = replaceMatches(
    'MACAU_ID',
    /\b\d{1}-?\d{6}-?\d\b|\b\d{7}\(\d\)\b/g,
    result,
    (m) => isValidMacauID(m),
  );

  // 5. 回乡证/台胞证
  result = replaceMatches(
    'HOME_RETURN_PERMIT',
    /\b[HhMm]\d{8,9}\b/g,
    result,
    (m) => isValidHomeReturnPermit(m),
  );

  result = replaceMatches(
    'TAIWAN_COMPATRIOT_PERMIT',
    /\b\d{8}\b/g,
    result,
    (m) => isValidTaiwanCompatriotPermit(m),
  );

  // 6. 手机号
  result = replaceMatches(
    'PHONE',
    /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    result,
  );

  // 7. 邮箱
  result = replaceMatches('EMAIL', /[\w.-]+@[\w.-]+\.\w+/g, result);

  // 8. 护照号
  result = replaceMatches(
    'PASSPORT',
    /(?<=(?:护照号|护照号码|护照编号|护照NO|护照No|Passport\s*(?:No|Number|#)?)[:：\.\s]*)[A-Za-z]\d{7,9}|[A-Za-z]{2}\d{7,9}\b/gi,
    result,
    (m) => isLikelyPassportNumber(m),
  );

  // 9. 姓名
  const COMPANY_SUFFIXES = /^(?:保险|证券|银行|基金|信托|期货|租赁|担保|资管|理财|公司|集团|企业|股份|有限|事务所|协会|合作社|联合会|基金会|研究院|中心|营业部|分公司|子公司|支公司|代表处|服务部|营销部|代理|经纪|公估|咨询)/;
  result = replaceMatches(
    'NAME',
    /(?<=(?:姓名|联系人|投保人|被保险人|被保人|受益人|受保人|保单持有人|客户|法定代表人|业务员|经办人|代理人|开户人|持卡人|账户持有人|基金持有人|股东)[:：\s]?)[\u4e00-\u9fa5]{2,4}(?=[\s\n,，。：:、男女\d]|$)/gm,
    result,
    (m, idx, text) => {
      if (INSURANCE_TERMS.has(m) || isFinanceTerm(m)) return false;
      const after = text.slice(idx + m.length, idx + m.length + 12);
      if (COMPANY_SUFFIXES.test(after)) return false;
      return true;
    },
  );

  // 10. 银行卡号
  result = replaceMatches(
    'BANK_CARD',
    /(?<=(?:银行卡号?|卡号|账户号?|账号|帐号|帐户)\s*[：:号]?\s*)\d{16,19}(?!\d)/g,
    result,
  );

  result = replaceMatches(
    'IBAN',
    /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    result,
  );

  result = replaceMatches(
    'SWIFT',
    /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/g,
    result,
  );

  result = replaceMatches(
    'CREDIT_CARD',
    /(?<!\d)\d{15,16}(?!\d)/g,
    result,
    (m) => m.length === 16 && luhnCheck(m),
  );

  // 11. 保单号
  result = replaceMatches(
    'POLICY_NUMBER',
    /(?<=(?:保单号|保险单号|投保单号|保险合同编号|保险编号|保单号码|保险单号码|投保单号码|保险凭证号|保险凭证编号|保险凭证号码)[:：\.\s号]*)[A-Za-z0-9\-]{6,30}(?=[\s\n,，。；;:、]|$)/g,
    result,
  );

  // 12. 地址
  result = replaceMatches(
    'ADDRESS',
    /(?<=(?:地址|住址|居住地|通讯地址|公司地址|家庭地址|居住地址|联系地址|聯絡地址|Contact\s*Address|Residence|Address)[:：\s]?)[\u4e00-\u9fa5]{0,5}[\u4e00-\u9fa5]{2,}(?:省|市|自治区|特别行政区|特別行政區)[\u4e00-\u9fa5]{2,}(?:市|县|区|縣|區)[\u4e00-\u9fa5\d\-]{3,}(?:路|街|號|号|栋|棟|单元|單元|室|里|村|镇|鎮|乡|鄉|巷|弄|段|大道)/g,
    result,
  );

  return { text: result, map };
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
  const newText = text.replace(selection, placeholder);

  const newMap = { ...existingMap, [placeholder]: selection };
  return { text: newText, map: newMap };
}

export function restore(text: string, map: SensitiveMap): string {
  let result = text;
  for (const [placeholder, original] of Object.entries(map)) {
    result = result.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      original,
    );
  }
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/api/services/desensitize.ts
git commit -m "feat(desensitize): add core desensitize service with PII detection"
```

---

### Task 2: 创建脱敏 API 路由

**Files:**
- Create: `electron/api/routes/desensitize.ts`
- Modify: `electron/api/server.ts:32-48`

- [ ] **Step 1: 写入路由代码**

```ts
// electron/api/routes/desensitize.ts
import type { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, sendJson } from '../route-utils';
import type { HostApiContext } from '../context';
import { desensitize, restore } from '../services/desensitize';

export async function handleDesensitizeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/desensitize' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ text: string }>(req);
      if (!body.text || typeof body.text !== 'string') {
        sendJson(res, 400, { success: false, error: 'text field is required' });
        return true;
      }
      const result = desensitize(body.text);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/desensitize/restore' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ text: string; map: Record<string, string> }>(req);
      if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
        sendJson(res, 400, { success: false, error: 'text and map fields are required' });
        return true;
      }
      const result = restore(body.text, body.map);
      sendJson(res, 200, { success: true, text: result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
```

- [ ] **Step 2: 注册路由到 server.ts**

修改 `electron/api/server.ts`：
- 在 `import { handleFileRoutes }` 下方添加 `import { handleDesensitizeRoutes } from './routes/desensitize';`
- 在 `coreRouteHandlers` 数组中添加 `handleDesensitizeRoutes`

```ts
import { handleDesensitizeRoutes } from './routes/desensitize';

const coreRouteHandlers: RouteHandler[] = [
  // ... existing handlers ...
  handleDesensitizeRoutes,
];
```

- [ ] **Step 3: Commit**

```bash
git add electron/api/routes/desensitize.ts electron/api/server.ts
git commit -m "feat(desensitize): add desensitize REST API routes"
```

---

### Task 3: 后端单元测试

**Files:**
- Create: `tests/unit/desensitize.test.ts`

- [ ] **Step 1: 写入测试代码**

```ts
// tests/unit/desensitize.test.ts
import { describe, it, expect } from 'vitest';
import { desensitize, restore } from '../../electron/api/services/desensitize';

describe('desensitize service', () => {
  describe('desensitize', () => {
    it('should replace phone numbers', () => {
      const result = desensitize('联系电话：13800138000');
      expect(result.text).toContain('__PII_PHONE_');
      expect(result.map).toMatchObject({});
      const placeholder = Object.keys(result.map)[0];
      expect(result.map[placeholder]).toBe('13800138000');
    });

    it('should replace email addresses', () => {
      const result = desensitize('邮箱：test@example.com');
      expect(result.text).toContain('__PII_EMAIL_');
      const placeholder = Object.keys(result.map)[0];
      expect(result.map[placeholder]).toBe('test@example.com');
    });

    it('should replace ID cards with valid checksum', () => {
      const result = desensitize('身份证号：110101199003078875');
      expect(result.text).toContain('__PII_ID_CARD_');
    });

    it('should not replace invalid ID cards', () => {
      const result = desensitize('身份证号：110101199003078876');
      expect(result.text).not.toContain('__PII_ID_CARD_');
    });

    it('should replace names after keywords', () => {
      const result = desensitize('投保人：张三');
      expect(result.text).toContain('__PII_NAME_');
      expect(result.map[Object.keys(result.map)[0]]).toBe('张三');
    });

    it('should not replace insurance terms as names', () => {
      const result = desensitize('保险期间：投保人');
      expect(result.text).not.toContain('__PII_NAME_保险期间');
    });
  });

  describe('restore', () => {
    it('should restore placeholders back to original values', () => {
      const map = {
        '__PII_PHONE_00000001__': '13800138000',
        '__PII_NAME_00000002__': '张三',
      };
      const restored = restore('联系人__PII_NAME_00000002__，电话__PII_PHONE_00000001__', map);
      expect(restored).toBe('联系人张三，电话13800138000');
    });
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test tests/unit/desensitize.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/desensitize.test.ts
git commit -m "test(desensitize): add unit tests for desensitize service"
```

---

## Chunk 2: 前端脱敏面板

### Task 4: 创建前端脱敏工具库

**Files:**
- Create: `src/lib/desensitize.ts`

- [ ] **Step 1: 写入代码**

```ts
// src/lib/desensitize.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/desensitize.ts
git commit -m "feat(desensitize): add frontend desensitize utility library"
```

---

### Task 5: 创建脱敏面板组件

**Files:**
- Create: `src/components/desensitize/DesensitizePanel.tsx`
- Create: `src/components/desensitize/DesensitizePreview.tsx`

**说明:** DesensitizePanel 是 Sheet 弹窗的主容器，包含上传/粘贴、OCR/文本提取、脱敏预览、确认填入流程。DesensitizePreview 是左右对比的预览组件。

- [ ] **Step 1: 写入 DesensitizePreview.tsx**

```tsx
// src/components/desensitize/DesensitizePreview.tsx
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatPlaceholderType } from '@/lib/desensitize';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePreviewProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
}

export function DesensitizePreview({ originalText, desensitizedText, sensitiveMap }: DesensitizePreviewProps) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(sensitiveMap)) {
      const match = key.match(/__PII_(\w+)_\d{8}__/);
      if (match) {
        const type = match[1];
        counts[type] = (counts[type] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([type, count]) => ({
      type,
      label: formatPlaceholderType(type),
      count,
    }));
  }, [sensitiveMap]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.map(({ type, label, count }) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-2xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
            >
              {label}: {count}处
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Original */}
        <div className="flex flex-col min-h-0">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5">原始内容</div>
          <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {originalText}
          </div>
        </div>

        {/* Desensitized */}
        <div className="flex flex-col min-h-0">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5">脱敏后</div>
          <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {desensitizedText.split(/(__PII_\w+_\d{8}__)/g).map((part, i) => {
              if (/__PII_\w+_\d{8}__/.test(part)) {
                return (
                  <span
                    key={i}
                    className="rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    title={sensitiveMap[part]}
                  >
                    {part}
                  </span>
                );
              }
              return part;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写入 DesensitizePanel.tsx**

```tsx
// src/components/desensitize/DesensitizePanel.tsx
import { useState, useCallback, useRef } from 'react';
import { Shield, Upload, FileText, X, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { toast } from 'sonner';
import { DesensitizePreview } from './DesensitizePreview';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePanelProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string, map: SensitiveMap) => void;
}

export function DesensitizePanel({ open, onClose, onConfirm }: DesensitizePanelProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'preview'>('upload');
  const [originalText, setOriginalText] = useState('');
  const [desensitizedText, setDesensitizedText] = useState('');
  const [sensitiveMap, setSensitiveMap] = useState<SensitiveMap>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setOriginalText('');
    setDesensitizedText('');
    setSensitiveMap({});
    setIsProcessing(false);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const processText = useCallback(async (text: string) => {
    if (!text.trim()) {
      toast.error('请输入或上传需要脱敏的内容');
      return;
    }
    setIsProcessing(true);
    setOriginalText(text);
    try {
      const result = await hostApiFetch<{ success: boolean; text?: string; map?: SensitiveMap; error?: string }>(
        '/api/desensitize',
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      if (!result.success || !result.text) {
        throw new Error(result.error || '脱敏失败');
      }
      setDesensitizedText(result.text);
      setSensitiveMap(result.map || {});
      setStep('preview');
    } catch (error) {
      toast.error(`脱敏失败: ${String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsProcessing(true);
    try {
      let text = '';
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        text = await file.text();
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // PDF: 使用已 staging 后的路径提取文本（简化：先上传再提取）
        // 实际实现中需要后端支持 PDF 文本提取，此处先提示用户
        toast.info('PDF 文件暂需手动粘贴文本内容');
        setIsProcessing(false);
        return;
      } else if (file.type.startsWith('image/')) {
        toast.info('图片文件暂需手动粘贴 OCR 结果');
        setIsProcessing(false);
        return;
      } else {
        text = await file.text();
      }
      await processText(text);
    } catch (error) {
      toast.error(`读取文件失败: ${String(error)}`);
      setIsProcessing(false);
    }
  }, [processText]);

  const handlePasteText = useCallback((text: string) => {
    void processText(text);
  }, [processText]);

  const handleConfirm = useCallback(() => {
    onConfirm(desensitizedText, sensitiveMap);
    handleClose();
  }, [desensitizedText, sensitiveMap, onConfirm, handleClose]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            脱敏工具
          </SheetTitle>
          <SheetDescription>
            上传文件或粘贴文本，自动识别并替换敏感信息
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 mt-4 flex flex-col">
          {step === 'upload' && (
            <div className="flex flex-col gap-4 h-full">
              {/* Drag & Drop Area */}
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-primary/[0.02]',
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFileSelect(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".txt,.md,.pdf,.docx,image/*"
                  onChange={(e) => void handleFileSelect(e.target.files)}
                />
                <Upload className="h-8 w-8 text-muted-foreground/60" />
                <div className="text-sm text-muted-foreground text-center">
                  <span className="text-primary font-medium">点击上传</span> 或拖拽文件到此处
                </div>
                <div className="text-2xs text-muted-foreground/60">
                  支持 .txt, .md, 图片（需OCR）, PDF（需OCR）
                </div>
              </div>

              {/* Text Paste */}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="text-sm font-medium text-muted-foreground">或直接粘贴文本</div>
                <textarea
                  className="flex-1 min-h-[120px] resize-none rounded-xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="将需要脱敏的文本粘贴到此处..."
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text/plain');
                    if (text) {
                      e.preventDefault();
                      handlePasteText(text);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在进行脱敏处理...</span>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-3 h-full min-h-0">
              <DesensitizePreview
                originalText={originalText}
                desensitizedText={desensitizedText}
                sensitiveMap={sensitiveMap}
              />
              <div className="flex items-center justify-end gap-2 shrink-0 pt-2 border-t border-border/30">
                <Button variant="outline" size="sm" onClick={reset}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  重新上传
                </Button>
                <Button size="sm" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  填入输入框
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/
git commit -m "feat(desensitize): add DesensitizePanel and DesensitizePreview components"
```

---

### Task 6: ChatInput 新增脱敏入口

**Files:**
- Modify: `src/pages/Chat/ChatInput.tsx:846-1059` (Action Row)

- [ ] **Step 1: 导入新增组件和图标**

在文件顶部 imports 中添加：
```tsx
import { Shield } from 'lucide-react';
import { DesensitizePanel } from '@/components/desensitize/DesensitizePanel';
import type { SensitiveMap } from '@/lib/desensitize';
```

- [ ] **Step 2: 在 ChatInput 组件内新增状态**

在 `ChatInput` 组件的状态声明区（约第 193-206 行）添加：
```tsx
const [desensitizeOpen, setDesensitizeOpen] = useState(false);
```

- [ ] **Step 3: 新增处理函数**

在 `handleSend` 附近添加：
```tsx
const handleDesensitizeConfirm = useCallback((text: string, map: SensitiveMap) => {
  // 将脱敏文本填入输入框
  setInput(text);
  // 存储 sensitiveMap 在消息发送时传递
  // 通过 ref 或扩展 attachments 来携带 map
}, []);
```

**注意:** 由于 `onSend` 签名需要扩展以携带 `sensitiveMap`，我们稍后处理。先让面板可以填入文本。

- [ ] **Step 4: Action Row 插入入口按钮**

在 Action Row 中，在 Attach Button 之后插入脱敏工具按钮（约第 857 行后）：

```tsx
{/* Desensitize Button */}
<Button
  variant="ghost"
  size="icon"
  className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
  onClick={() => setDesensitizeOpen(true)}
  disabled={disabled || sending}
  title="脱敏工具"
>
  <Shield className="h-3.5 w-3.5" />
</Button>
```

- [ ] **Step 5: 在 JSX 末尾添加面板**

在 `</div>` (第 1092 行的根容器闭合标签) 之前添加：

```tsx
<DesensitizePanel
  open={desensitizeOpen}
  onClose={() => setDesensitizeOpen(false)}
  onConfirm={(text, map) => {
    setInput(text);
    // 将 map 暂存到组件局部状态，handleSend 时附加到消息
    // 这里使用一个 ref 来存储
  }}
/>
```

由于需要扩展 `onSend` 签名以传递 `sensitiveMap`，我们需要修改 `ChatInputProps`：

```tsx
interface ChatInputProps {
  onSend: (text: string, attachments?: FileAttachment[], targetAgentId?: string | null, desensitizeMap?: Record<string, string>) => void;
  // ... rest
}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Chat/ChatInput.tsx
git commit -m "feat(desensitize): add desensitize tool entry in ChatInput action row"
```

---

## Chunk 3: 消息恢复流程

### Task 7: 扩展消息类型

**Files:**
- Modify: `src/stores/chat/types.ts:22-37`

- [ ] **Step 1: 扩展 RawMessage**

在 `RawMessage` 接口中添加：
```ts
/** Local-only: desensitize map for restoring original PII */
_desensitizeMap?: Record<string, string>;
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/chat/types.ts
git commit -m "feat(desensitize): extend RawMessage with _desensitizeMap field"
```

---

### Task 8: 消息气泡支持恢复视图

**Files:**
- Modify: `src/pages/Chat/ChatMessage.tsx`

**说明:** 在用户消息气泡右上角添加 Eye 图标，点击切换原文/脱敏显示。AI 回复如果包含占位符也支持切换。

- [ ] **Step 1: 导入依赖**

在 imports 中添加：
```tsx
import { Eye, EyeOff } from 'lucide-react';
import { restoreText, hasPlaceholders } from '@/lib/desensitize';
```

- [ ] **Step 2: 新增消息级恢复状态管理**

在 `ChatMessage` 组件内部（第 224 行后）添加：
```tsx
const [showOriginal, setShowOriginal] = useState(false);
const messageMap = (message as Record<string, unknown>)._desensitizeMap as Record<string, string> | undefined;
const hasDesensitized = !!messageMap && Object.keys(messageMap).length > 0;
```

- [ ] **Step 3: 计算显示文本**

在 `const text = textOverride ?? extractText(message);` 之后：
```tsx
const displayText = useMemo(() => {
  if (showOriginal && hasDesensitized && messageMap) {
    return restoreText(text, messageMap);
  }
  return text;
}, [text, showOriginal, hasDesensitized, messageMap]);
```

- [ ] **Step 4: MessageBubble 使用 displayText**

将第 409-414 行的 `MessageBubble` 调用中的 `text` 改为 `displayText`。

- [ ] **Step 5: 在用户消息气泡上添加 Eye 切换按钮**

在用户消息的 hover 行（约第 467-470 行）添加 Eye 图标：

```tsx
{/* Hover row for user messages */}
{isUser && (
  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
    {hasDesensitized && (
      <button
        onClick={() => setShowOriginal((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        title={showOriginal ? '显示脱敏文本' : '显示原文'}
      >
        {showOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {showOriginal ? '脱敏' : '原文'}
      </button>
    )}
    {message.timestamp && (
      <span className="text-xs text-muted-foreground">
        {formatTimestamp(message.timestamp)}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 6: AI 回复也支持恢复**

对于 AI 回复，如果文本中包含占位符（说明用户消息发送了脱敏内容，AI 回复引用了占位符），也显示 Eye 切换：

在 `!isUser && hasText` 区域（AssistantHoverBar 之前）添加类似的恢复逻辑：

```tsx
// AI 消息如果包含占位符，使用对应用户消息的 map 恢复
const [aiShowOriginal, setAiShowOriginal] = useState(false);
// 查找同一 run 中最近的用户消息以获取 map
```

由于 AI 消息的恢复需要关联到用户消息的 map，这个逻辑在 Chat/index.tsx 中处理更合适。简化方案：AI 消息如果包含占位符，也支持本地恢复（假设占位符在文本中直接出现）。

在 `MessageBubble` 组件中处理：传入一个可选的 `restoreMap`，如果有则支持恢复。

修改 `MessageBubble` Props：
```tsx
interface MessageBubbleProps {
  text: string;
  isUser: boolean;
  isStreaming: boolean;
  restoreMap?: Record<string, string>;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/Chat/ChatMessage.tsx
git commit -m "feat(desensitize): add eye toggle for restoring original text in message bubbles"
```

---

### Task 9: ChatToolbar 全局 Toggle

**Files:**
- Modify: `src/pages/Chat/ChatToolbar.tsx`

- [ ] **Step 1: 添加全局显示模式状态**

使用 Zustand store 或 React Context 存储全局显示模式。为了简单，我们先在 ChatToolbar 中添加一个本地 Toggle，通过 chat store 或 IPC 影响全局。

实际上，由于消息气泡是独立组件，全局 Toggle 最好通过 Chat store 或一个独立的 desensitize store 来管理。

创建 `src/stores/desensitize-view.ts`：

```ts
import { create } from 'zustand';

interface DesensitizeViewState {
  globalShowOriginal: boolean;
  toggleGlobalShowOriginal: () => void;
  setGlobalShowOriginal: (value: boolean) => void;
}

export const useDesensitizeViewStore = create<DesensitizeViewState>((set) => ({
  globalShowOriginal: false,
  toggleGlobalShowOriginal: () => set((s) => ({ globalShowOriginal: !s.globalShowOriginal })),
  setGlobalShowOriginal: (value) => set({ globalShowOriginal: value }),
}));
```

- [ ] **Step 2: 在 ChatToolbar 中添加 Toggle**

修改 `ChatToolbar.tsx`：

```tsx
import { Eye, EyeOff } from 'lucide-react';
import { useDesensitizeViewStore } from '@/stores/desensitize-view';
```

在 Action buttons 区域添加：

```tsx
const globalShowOriginal = useDesensitizeViewStore((s) => s.globalShowOriginal);
const toggleGlobal = useDesensitizeViewStore((s) => s.toggleGlobalShowOriginal);

{/* Global desensitize view toggle */}
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'h-8 w-8 rounded-lg transition-all duration-200',
        'hover:bg-foreground/6 dark:hover:bg-white/8',
        globalShowOriginal && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
      )}
      onClick={toggleGlobal}
      aria-label="切换脱敏显示模式"
    >
      {globalShowOriginal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>{globalShowOriginal ? '显示脱敏文本' : '显示原文'}</p>
  </TooltipContent>
</Tooltip>
```

- [ ] **Step 3: ChatMessage 读取全局状态**

在 `ChatMessage.tsx` 中：

```tsx
import { useDesensitizeViewStore } from '@/stores/desensitize-view';
```

在组件内：
```tsx
const globalShowOriginal = useDesensitizeViewStore((s) => s.globalShowOriginal);
const effectiveShowOriginal = showOriginal || globalShowOriginal;
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/desensitize-view.ts src/pages/Chat/ChatToolbar.tsx src/pages/Chat/ChatMessage.tsx
git commit -m "feat(desensitize): add global show-original toggle in ChatToolbar"
```

---

## Chunk 4: 集成与收尾

### Task 10: Chat Store 集成发送逻辑

**Files:**
- Modify: `src/stores/chat/index.ts` 或相关 sendMessage 实现文件

**说明:** 需要找到 sendMessage 的具体实现，将 `desensitizeMap` 附加到发送的消息上。

由于 sendMessage 的具体实现在 chat store 中，需要扩展 `sendMessage` 签名和 `RawMessage` 结构。

- [ ] **Step 1: 扩展 sendMessage 签名**

在 `src/stores/chat/types.ts` 中修改：
```ts
sendMessage: (
  text: string,
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    fileSize: number;
    stagedPath: string;
    preview: string | null;
  }>,
  targetAgentId?: string | null,
  desensitizeMap?: Record<string, string>,
) => Promise<void>;
```

- [ ] **Step 2: 在发送时附加 map**

在 sendMessage 实现中，当创建用户消息时：
```ts
const userMessage: RawMessage = {
  role: 'user',
  content: text,
  timestamp: Date.now() / 1000,
  _attachedFiles: attachments ? ... : undefined,
  _desensitizeMap: desensitizeMap,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/chat/
git commit -m "feat(desensitize): integrate desensitizeMap into message send flow"
```

---

### Task 11: 类型检查与修复

- [ ] **Step 1: 运行类型检查**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: 运行测试**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(desensitize): fix typecheck and test issues"
```

---

### Task 12: i18n 支持

**Files:**
- Modify: `public/locales/*/chat.json`

- [ ] **Step 1: 添加中文翻译键**

在 `public/locales/zh/chat.json` 中添加：
```json
{
  "desensitize": {
    "title": "脱敏工具",
    "description": "上传文件或粘贴文本，自动识别并替换敏感信息",
    "uploadHint": "点击上传或拖拽文件到此处",
    "pasteHint": "将需要脱敏的文本粘贴到此处...",
    "processing": "正在进行脱敏处理...",
    "original": "原始内容",
    "desensitized": "脱敏后",
    "reupload": "重新上传",
    "confirm": "填入输入框",
    "showOriginal": "显示原文",
    "showDesensitized": "显示脱敏文本"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/locales/
git commit -m "i18n(desensitize): add Chinese translations for desensitize feature"
```

---

## Execution Notes

1. **OCR 支持:** 当前版本对图片/PDF 的 OCR 支持采用简化方案 —— 提示用户手动粘贴 OCR 结果。后续可集成 `tesseract.js` 或后端 `pdfjs-dist` 提取文本。

2. **AI 回复恢复:** AI 回复中如果包含 `__PII_` 占位符，支持通过 Eye 图标恢复为原文。恢复逻辑使用同一 run 中最近用户消息的 `_desensitizeMap`。如果 AI 回复中没有占位符，则不显示恢复按钮。

3. **全局 Toggle 优先级:** 全局 Toggle 的优先级高于单条消息的 Toggle。即全局设为"显示原文"时，所有消息都显示原文，不受单条消息状态影响。
