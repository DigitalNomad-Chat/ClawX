export type Tier = 'free' | 'pro' | 'enterprise';
export type Feature = 'collaboration' | 'marketplace';
export type TriggerAction = 'create_task' | 'hire_agent';

export interface UsageInfo {
  feature: Feature;
  used: number;
  limit: number;
  remaining: number;
  tier: Tier;
}

export interface FeatureTokenPayload {
  sub: string;
  tier: Tier;
  deviceId: string;
  clientType: string;
  features: string[];
  keyId: string;
  usage: Record<Feature, { used: number; limit: number }>;
  offlineBudget: number;
  iat: number;
  exp: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  deviceId?: string;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  subscriptionTier: Tier;
  balance: number;
}

export enum MemberEvent {
  NETWORK_ONLINE = 'member:network-online',
  NETWORK_OFFLINE = 'member:network-offline',
  TOKEN_EXPIRED = 'member:token-expired',
  TIER_CHANGED = 'member:tier-changed',
  USAGE_SYNC_REQUIRED = 'member:usage-sync-required',
  LOGIN_SUCCESS = 'member:login-success',
  LOGOUT = 'member:logout',
}

export interface MemberState {
  isLoggedIn: boolean;
  isGuest: boolean;
  userInfo: UserInfo | null;
  tier: Tier | null;
  isOnline: boolean;
  featureToken: FeatureTokenPayload | null;
}

// ===== 新增类型（独立会员体系）=====

export type LicenseKey = string;

export interface TierConfig {
  name: string;
  displayName: string;
  monthlyQuota: number;      // 0 = unlimited
  features: Feature[];
  maxDevices: number;
}

export interface VerificationResult {
  success: boolean;
  tier?: Tier;
  expiresAt?: number;        // timestamp ms
  signature?: string;        // RSA signature from verification server
  reason?: string;
}

export interface ActivationResult {
  success: boolean;
  tier?: Tier;
  expiresAt?: number;
  reason?: string;
}

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbSubscription {
  id: string;
  user_id: string;
  tier: Tier;
  status: 'active' | 'expired' | 'cancelled';
  started_at: number | null;
  expires_at: number | null;
  activated_by: string | null;
  last_verified_at: number | null;
  verification_signature: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbFeatureUsage {
  id: number;
  user_id: string;
  feature: Feature;
  year_month: string;
  used_count: number;
}

export interface DbActivation {
  id: string;
  user_id: string | null;
  license_key: string;
  device_fingerprint: string | null;
  tier: Tier;
  activated_at: number;
  expires_at: number | null;
  last_verified_at: number | null;
  verification_data: string | null;
  revoked: number;
}
