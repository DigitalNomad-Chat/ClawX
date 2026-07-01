/**
 * Office Tools Module — Shared Types
 */

import type { InsuranceType, Relationship, RenewalStatus, PaymentFrequency } from './constants';

/** Tool card metadata displayed on the landing page */
export interface OfficeTool {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  path: string;
  badge?: string;
  disabled?: boolean;
}

/** Policy record stored in SQLite */
export interface PolicyRecord {
  id: number;
  familyId: string;
  familyName: string;
  policyNo: string;
  insurer: string;
  productName: string;
  premium: number;
  sumAssured: number;
  effectiveDate: string;
  expiryDate: string;
  status: 'active' | 'lapsed' | 'terminated' | 'pending';
  beneficiary: string;
  remarks?: string;
  insuranceType?: InsuranceType;
  policyHolder: string;
  insuredPerson: string;
  relationship?: Relationship;
  paymentAccount?: string;
  purchasePlatform?: string;
  paymentFrequency?: PaymentFrequency;
  thisYearRenewed: boolean;
  followUpRecord?: string;
  statusTag?: string;
  renewalStatus?: RenewalStatus;
  daysToRenewal?: number;
  renewalDate?: string;
  createdAt: string;
  updatedAt: string;
}

/** Family group header for policy list */
export interface PolicyFamily {
  id: string;
  name: string;
  memberCount: number;
  totalPremium: number;
  totalSumAssured: number;
  contactInfo?: string;
  remark?: string;
  policies: PolicyRecord[];
}

/** Document parser session */
export interface DocumentSession {
  id: string;
  name: string;
  sourceType: 'upload' | 'paste';
  originalText: string;
  desensitizedText?: string;
  refinedText?: string;
  sensitiveMap?: Record<string, string>;
  status: 'idle' | 'ocr' | 'desensitize' | 'refine' | 'done' | 'error';
  aiInstruction?: string;
  sceneId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Dashboard stats for office tools */
export interface OfficeToolsStats {
  totalFamilies: number;
  totalPolicies: number;
  totalPremium: number;
  totalSumAssured: number;
  activePolicies: number;
  pendingPolicies: number;
  documentsParsed: number;
  upcomingRenewals: { within7Days: number; within30Days: number; within60Days: number };
  statusDistribution: { normal: number; grace: number; lapsed: number; renewed: number };
  typeDistribution: Record<string, number>;
}
