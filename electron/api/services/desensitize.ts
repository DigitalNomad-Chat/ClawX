export interface SensitiveMap {
  [placeholder: string]: string;
}

interface DesensitizeResult {
  text: string;
  map: SensitiveMap;
  stats?: Record<string, number>;
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

  // 香港手机号
  result = replaceMatches(
    'PHONE_HK',
    /(?<!\d)(?:\+?852[-\s]?)?[2-9]\d{3}[-\s]?\d{4}(?!\d)/g,
    result,
  );

  // 台湾手机号
  result = replaceMatches(
    'PHONE_TW',
    /(?<!\d)(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g,
    result,
  );

  // 澳门手机号
  result = replaceMatches(
    'PHONE_MO',
    /(?<!\d)(?:\+?853[-\s]?)?[6]\d{3}[-\s]?\d{4}(?!\d)/g,
    result,
  );

  // 7. 邮箱
  result = replaceMatches('EMAIL', /[\w.-]+@[\w.-]+\.\w+/g, result);

  // 8. 护照号
  result = replaceMatches(
    'PASSPORT',
    /(?<=(?:护照号|护照号码|护照编号|护照NO|护照No|Passport\s*(?:No|Number|#)?)[:：.\s]*)[A-Za-z]\d{7,9}|[A-Za-z]{2}\d{7,9}\b/gi,
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
    /(?<=(?:保单号|保险单号|投保单号|保险合同编号|保险编号|保单号码|保险单号码|投保单号码|保险凭证号|保险凭证编号|保险凭证号码)[:：.\s号]*)[A-Za-z0-9-]{6,30}(?=[\s\n,，。；;:、]|$)/g,
    result,
  );

  // 英文 Policy Number
  result = replaceMatches(
    'POLICY_NUMBER',
    /(?<=Policy\s*(?:No|Number|#)?[:\.\s]*)[A-Za-z0-9\-]{6,30}(?=[\s\n,，。；;:、]|$)/gi,
    result,
  );

  // 香港/国际保险单号
  result = replaceMatches(
    'POLICY_NUMBER',
    /\b(?:P|POL|INS|LIF)[\-\s]?\d{6,12}\b/gi,
    result,
  );

  // 基金账号
  result = replaceMatches(
    'FUND_ACCOUNT',
    /(?<=(?:基金账号|基金账户|基金帐号|基金戶口|Fund\s*(?:Acc|Account|#)?)[:：\.\s]*)[A-Za-z0-9]{8,20}(?=[\s\n,，。；;:、]|$)/gi,
    result,
  );

  // 证券/股票账号
  result = replaceMatches(
    'STOCK_ACCOUNT',
    /(?<=(?:证券账号|证券账户|股票账号|股票账户|证券帐号|股票帐号|证券戶口|股票戶口|Securities\s*(?:Acc|Account|#)?|Stock\s*(?:Acc|Account|#)?)[:：\.\s]*)[A-Za-z]\d{8,12}(?=[\s\n,，。；;:、]|$)/gi,
    result,
  );

  // 社保号/公积金账号
  result = replaceMatches(
    'SOCIAL_SECURITY',
    /(?<=(?:社保卡号|社保卡號|社保号|社保號|社会保障号|社会保障號|公积金账号|公積金賬號|公积金帐户|公積金帳戶|住房公积金号|住房公積金號)[:：\.\s]*)\d{9,18}(?=[\s\n,，。；;:、]|$)/g,
    result,
  );

  // 12. 地址
  result = replaceMatches(
    'ADDRESS',
    /(?<=(?:地址|住址|居住地|通讯地址|公司地址|家庭地址|居住地址|联系地址|聯絡地址|Contact\s*Address|Residence|Address)[:：\s]?)[\u4e00-\u9fa5]{0,5}[\u4e00-\u9fa5]{2,}(?:省|市|自治区|特别行政区|特別行政區)[\u4e00-\u9fa5]{2,}(?:市|县|区|縣|區)[\u4e00-\u9fa5\d\-]{3,}(?:路|街|號|号|栋|棟|单元|單元|室|里|村|镇|鎮|乡|鄉|巷|弄|段|大道)/g,
    result,
  );

  const stats: Record<string, number> = {};
  for (const placeholder of Object.keys(map)) {
    const typeMatch = placeholder.match(/__PII_(\w+)_\d+__/);
    if (typeMatch) {
      const type = typeMatch[1];
      stats[type] = (stats[type] || 0) + 1;
    }
  }

  return { text: result, map, stats };
}

export function markSensitive(
  text: string,
  existingMap: SensitiveMap,
  selection: string,
  type: string,
): { text: string; map: SensitiveMap } {
  const trimmed = selection.trim();
  if (!trimmed) return { text, map: existingMap };

  // 防止用户选中已包含占位符的文本再次标记
  if (/__PII_\w+_\d{8}__/.test(trimmed)) {
    return { text, map: existingMap };
  }

  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;

  const idx = text.indexOf(trimmed);
  if (idx === -1) return { text, map: existingMap };

  const newText = text.slice(0, idx) + placeholder + text.slice(idx + trimmed.length);
  const newMap = { ...existingMap, [placeholder]: trimmed };
  return { text: newText, map: newMap };
}

export interface BatchMarkItem {
  keyword: string;
  type: string;
}

export function batchMarkSensitive(
  text: string,
  existingMap: SensitiveMap,
  items: BatchMarkItem[],
): { text: string; map: SensitiveMap } {
  if (!items.length) return { text, map: existingMap };

  let currentText = text;
  let currentMap = { ...existingMap };

  for (const { keyword, type } of items) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    if (/__PII_\w+_\d{8}__/.test(trimmed)) continue;

    const result = markSensitiveAllBackend(currentText, currentMap, trimmed, type);
    currentText = result.text;
    currentMap = result.map;
  }

  return { text: currentText, map: currentMap };
}

function markSensitiveAllBackend(
  text: string,
  existingMap: SensitiveMap,
  keyword: string,
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

  if (!text.includes(keyword)) return { text, map: existingMap };

  const newText = text.split(keyword).join(placeholder);
  const newMap = { ...existingMap, [placeholder]: keyword };
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
