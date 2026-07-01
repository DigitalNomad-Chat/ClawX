/**
 * Office Tools Module — CSV Utilities
 *
 * Parse and generate CSV for policy import/export with bilingual
 * column support, enum mapping, and Excel-compatible formatting.
 */

import {
  CHINESE_TO_INSURANCE_TYPE,
  CHINESE_TO_RELATIONSHIP,
  CHINESE_TO_PAYMENT_FREQUENCY,
  INSURANCE_TYPE_TO_CHINESE,
  RELATIONSHIP_TO_CHINESE,
  RENEWAL_STATUS_TO_CHINESE,
  PAYMENT_FREQUENCY_TO_CHINESE,
  INSURANCE_TYPES,
  RELATIONSHIPS,
  PAYMENT_FREQUENCIES,
  type InsuranceType,
  type Relationship,
  type PaymentFrequency,
  type RenewalStatus,
} from '../../../src/modules/office-tools/constants';
import type { PolicyRecord } from '../../../src/modules/office-tools/types';

// ─── parseCSV ─────────────────────────────────────────────────────

/**
 * Parse CSV text into an array of row objects keyed by header.
 * Handles quoted fields, escaped quotes (""), both \n and \r\n.
 */
export function parseCSV(text: string): Record<string, string>[] {
  // Split text into rows respecting quoted fields
  const rows: string[][] = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\r') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        if (i < text.length && text[i] === '\n') {
          i++;
        }
        rows.push(currentRow);
        currentRow = [];
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Push remaining field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Remove trailing empty rows
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0].trim() === '') {
      rows.pop();
    } else {
      break;
    }
  }

  if (rows.length === 0) return [];

  // First row is the header
  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < row.length ? row[c] : '';
    }
    result.push(obj);
  }

  return result;
}

// ─── mapCsvRowToPolicy ────────────────────────────────────────────

/**
 * Map a CSV row to a policy DTO.
 * Supports both Chinese and English column names.
 */
export function mapCsvRowToPolicy(
  row: Record<string, string>,
  familyId: string,
  familyName: string,
): Partial<PolicyRecord> & { familyId: string; familyName: string } {
  // Helper to get a value by possible column names
  const get = (...keys: string[]): string => {
    for (const key of keys) {
      const val = row[key];
      if (val !== undefined && val !== null) return val.trim();
    }
    return '';
  };

  const rawProductName = get('productName', '产品名称');
  const rawInsuranceType = get('insuranceType', '险种');
  const rawFamilyName = get('familyName', '家庭');
  const rawPolicyHolder = get('policyHolder', '投保人');
  const rawInsuredPerson = get('insuredPerson', '被保人');
  const rawRelationship = get('relationship', '关系');
  const rawPremium = get('premium', '保费');
  const rawEffectiveDate = get('effectiveDate', '生效日期');
  const rawPaymentFrequency = get('paymentFrequency', '缴费频率');
  const rawThisYearRenewed = get('thisYearRenewed', '今年已续');
  const rawPaymentAccount = get('paymentAccount', '缴费账户');
  const rawPurchasePlatform = get('purchasePlatform', '购买平台');
  const rawFollowUpRecord = get('followUpRecord', '跟进记录');
  const rawStatusTag = get('statusTag', '状态标记');
  const rawRemarks = get('remarks', '备注');

  // insuranceType: prefer raw value if valid enum, otherwise map from Chinese
  const insuranceType = resolveInsuranceType(rawInsuranceType);
  const relationship = resolveRelationship(rawRelationship);
  const paymentFrequency = resolvePaymentFrequency(rawPaymentFrequency);

  // premium: strip currency symbols/commas, parse as float
  const premium = parsePremium(rawPremium);

  // effectiveDate: validate and normalize to YYYY-MM-DD
  const effectiveDate = parseEffectiveDate(rawEffectiveDate);

  // thisYearRenewed: boolean
  const thisYearRenewed = parseBooleanFlag(rawThisYearRenewed);

  return {
    familyId,
    familyName: rawFamilyName || familyName,
    productName: rawProductName,
    insuranceType,
    policyHolder: rawPolicyHolder,
    insuredPerson: rawInsuredPerson,
    relationship,
    premium,
    effectiveDate,
    paymentFrequency,
    thisYearRenewed,
    paymentAccount: rawPaymentAccount,
    purchasePlatform: rawPurchasePlatform,
    followUpRecord: rawFollowUpRecord,
    statusTag: rawStatusTag,
    remarks: rawRemarks,
  };
}

/** Resolve insurance type from raw string value */
function resolveInsuranceType(raw: string): InsuranceType | undefined {
  if (!raw) return undefined;
  // Check if it's already a valid enum value
  if (Object.values(INSURANCE_TYPES).includes(raw as InsuranceType)) {
    return raw as InsuranceType;
  }
  // Try Chinese mapping
  return CHINESE_TO_INSURANCE_TYPE[raw] ?? undefined;
}

/** Resolve relationship from raw string value */
function resolveRelationship(raw: string): Relationship | undefined {
  if (!raw) return undefined;
  if (Object.values(RELATIONSHIPS).includes(raw as Relationship)) {
    return raw as Relationship;
  }
  return CHINESE_TO_RELATIONSHIP[raw] ?? undefined;
}

/** Resolve payment frequency from raw string value */
function resolvePaymentFrequency(raw: string): PaymentFrequency | undefined {
  if (!raw) return undefined;
  if (Object.values(PAYMENT_FREQUENCIES).includes(raw as PaymentFrequency)) {
    return raw as PaymentFrequency;
  }
  return CHINESE_TO_PAYMENT_FREQUENCY[raw] ?? undefined;
}

/** Parse premium value, stripping currency symbols and commas */
function parsePremium(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[￥$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/** Validate and normalize effective date to YYYY-MM-DD */
function parseEffectiveDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Try parsing common date formats
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a boolean flag from string value */
function parseBooleanFlag(raw: string): boolean | undefined {
  if (!raw) return undefined;
  const lower = raw.trim().toLowerCase();
  return lower === '1' || lower === '是' || lower === 'true' || lower === 'yes';
}

// ─── policiesToCsv ────────────────────────────────────────────────

/** Export columns in Chinese order for CSV output */
const EXPORT_HEADERS: Array<{ key: keyof PolicyRecord; label: string }> = [
  { key: 'productName', label: '产品名称' },
  { key: 'insuranceType', label: '险种' },
  { key: 'familyName', label: '家庭' },
  { key: 'policyHolder', label: '投保人' },
  { key: 'insuredPerson', label: '被保人' },
  { key: 'relationship', label: '关系' },
  { key: 'premium', label: '保费' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'renewalStatus', label: '续期状态' },
  { key: 'daysToRenewal', label: '距离续期(天)' },
  { key: 'thisYearRenewed', label: '今年已续' },
  { key: 'followUpRecord', label: '跟进记录' },
  { key: 'statusTag', label: '状态标记' },
  { key: 'remarks', label: '备注' },
  { key: 'paymentAccount', label: '缴费账户' },
  { key: 'purchasePlatform', label: '购买平台' },
  { key: 'paymentFrequency', label: '缴费频率' },
];

/**
 * Generate CSV string from policy records.
 * Includes UTF-8 BOM for Excel compatibility.
 */
export function policiesToCsv(policies: PolicyRecord[]): string {
  const bom = '﻿';
  const headerLine = EXPORT_HEADERS.map((h) => h.label).join(',');
  const lines: string[] = [headerLine];

  for (const policy of policies) {
    const values = EXPORT_HEADERS.map((h) => {
      const raw = policy[h.key];
      return formatCellValue(h.key, raw);
    });
    lines.push(values.join(','));
  }

  return bom + lines.join('\n');
}

/** Format a single cell value for CSV output */
function formatCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';

  switch (key) {
    case 'insuranceType': {
      const v = value as InsuranceType;
      return INSURANCE_TYPE_TO_CHINESE[v] ?? String(v);
    }
    case 'relationship': {
      const v = value as Relationship;
      return RELATIONSHIP_TO_CHINESE[v] ?? String(v);
    }
    case 'renewalStatus': {
      const v = value as RenewalStatus;
      return RENEWAL_STATUS_TO_CHINESE[v] ?? String(v);
    }
    case 'premium': {
      return typeof value === 'number' ? value.toFixed(2) : String(value);
    }
    case 'effectiveDate':
    case 'renewalDate': {
      return formatDate(value as string);
    }
    case 'thisYearRenewed': {
      return value === true ? '是' : '否';
    }
    case 'paymentFrequency': {
      const v = value as PaymentFrequency;
      return PAYMENT_FREQUENCY_TO_CHINESE[v] ?? String(v);
    }
    case 'daysToRenewal': {
      return String(value);
    }
    default: {
      return String(value);
    }
  }
}

/** Format a date string as YYYY-MM-DD, return empty string if invalid */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
