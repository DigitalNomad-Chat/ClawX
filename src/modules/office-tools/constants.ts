/**
 * Office Tools Module — Constants & Mappings
 *
 * Shared enum values, display labels, colors, and bidirectional
 * mapping helpers for insurance policies, relationships, renewal
 * statuses, and payment frequencies.
 */

// ─── Insurance Types ───────────────────────────────────────────────

/** Insurance type enum values */
export const INSURANCE_TYPES = {
  MEDICAL: 'medical',
  ACCIDENT: 'accident',
  CRITICAL: 'critical',
  LIFE: 'life',
  ANNUITY: 'annuity',
  OTHER: 'other',
} as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[keyof typeof INSURANCE_TYPES];

/** Chinese labels for insurance types */
export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  medical: '医疗险',
  accident: '意外险',
  critical: '重疾险',
  life: '定期寿险',
  annuity: '年金险',
  other: '其他',
};

/** Hex color codes for insurance types */
export const INSURANCE_TYPE_COLORS: Record<InsuranceType, string> = {
  medical: '#409EFF',
  accident: '#67C23A',
  critical: '#E6A23C',
  life: '#F56C6C',
  annuity: '#909399',
  other: '#C0C4CC',
};

// ─── Relationships ─────────────────────────────────────────────────

/** Relationship enum values */
export const RELATIONSHIPS = {
  SELF: 'self',
  SPOUSE: 'spouse',
  CHILD: 'child',
  PARENT: 'parent',
  OTHER: 'other',
} as const;

export type Relationship = (typeof RELATIONSHIPS)[keyof typeof RELATIONSHIPS];

/** Chinese labels for relationships */
export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  other: '其他',
};

// ─── Renewal Statuses ──────────────────────────────────────────────

/** Renewal status enum values */
export const RENEWAL_STATUSES = {
  NORMAL: 'normal',
  GRACE: 'grace',
  LAPSED: 'lapsed',
  RENEWED: 'renewed',
} as const;

export type RenewalStatus = (typeof RENEWAL_STATUSES)[keyof typeof RENEWAL_STATUSES];

/** Chinese labels for renewal statuses */
export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  normal: '准备续费',
  grace: '保费宽限期',
  lapsed: '保单失效',
  renewed: '已续费',
};

/** shadcn/ui Badge variant types for renewal statuses */
export const RENEWAL_STATUS_TYPES: Record<RenewalStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  normal: 'success',
  grace: 'warning',
  lapsed: 'danger',
  renewed: 'info',
};

// ─── Payment Frequencies ───────────────────────────────────────────

/** Payment frequency enum values */
export const PAYMENT_FREQUENCIES = {
  ANNUAL: 'annual',
  SEMI_ANNUAL: 'semi_annual',
  QUARTERLY: 'quarterly',
  MONTHLY: 'monthly',
  ONE_TIME: 'one_time',
} as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[keyof typeof PAYMENT_FREQUENCIES];

/** Chinese labels for payment frequencies */
export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  annual: '年缴',
  semi_annual: '半年缴',
  quarterly: '季缴',
  monthly: '月缴',
  one_time: '一次性',
};

// ─── Bidirectional Mapping Helpers ─────────────────────────────────

/** Chinese → insurance type lookup (for CSV import) */
export const CHINESE_TO_INSURANCE_TYPE: Record<string, InsuranceType> = {
  '医疗险': INSURANCE_TYPES.MEDICAL,
  '意外险': INSURANCE_TYPES.ACCIDENT,
  '重疾险': INSURANCE_TYPES.CRITICAL,
  '定期寿险': INSURANCE_TYPES.LIFE,
  '年金险': INSURANCE_TYPES.ANNUITY,
  '其他': INSURANCE_TYPES.OTHER,
};

/** Chinese → relationship lookup (for CSV import) */
export const CHINESE_TO_RELATIONSHIP: Record<string, Relationship> = {
  '本人': RELATIONSHIPS.SELF,
  '配偶': RELATIONSHIPS.SPOUSE,
  '子女': RELATIONSHIPS.CHILD,
  '父母': RELATIONSHIPS.PARENT,
  '其他': RELATIONSHIPS.OTHER,
};

/** Insurance type → Chinese (for CSV export) */
export const INSURANCE_TYPE_TO_CHINESE: Record<InsuranceType, string> = {
  [INSURANCE_TYPES.MEDICAL]: '医疗险',
  [INSURANCE_TYPES.ACCIDENT]: '意外险',
  [INSURANCE_TYPES.CRITICAL]: '重疾险',
  [INSURANCE_TYPES.LIFE]: '定期寿险',
  [INSURANCE_TYPES.ANNUITY]: '年金险',
  [INSURANCE_TYPES.OTHER]: '其他',
};

/** Relationship → Chinese (for CSV export) */
export const RELATIONSHIP_TO_CHINESE: Record<Relationship, string> = {
  [RELATIONSHIPS.SELF]: '本人',
  [RELATIONSHIPS.SPOUSE]: '配偶',
  [RELATIONSHIPS.CHILD]: '子女',
  [RELATIONSHIPS.PARENT]: '父母',
  [RELATIONSHIPS.OTHER]: '其他',
};

/** Renewal status → Chinese (for CSV export) */
export const RENEWAL_STATUS_TO_CHINESE: Record<RenewalStatus, string> = {
  [RENEWAL_STATUSES.NORMAL]: '准备续费',
  [RENEWAL_STATUSES.GRACE]: '保费宽限期',
  [RENEWAL_STATUSES.LAPSED]: '保单失效',
  [RENEWAL_STATUSES.RENEWED]: '已续费',
};
