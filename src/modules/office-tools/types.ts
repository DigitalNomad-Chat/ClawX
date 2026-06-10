/**
 * Office Tools Module — Shared Types
 */

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
}
