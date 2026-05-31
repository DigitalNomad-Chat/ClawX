export type Tier = 'free' | 'pro' | 'enterprise';
export type Feature = 'collaboration' | 'marketplace';
export type TriggerAction = 'create_task' | 'hire_agent';

export interface UsageInfo {
  feature: Feature;
  used: number;
  limit: number;
  remaining: number;
  tier: Tier;
  allowed?: boolean;
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
}

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
  signature?: string;
  reason?: string;
}

export interface ActivationResult {
  success: boolean;
  tier?: Tier;
  expiresAt?: number;
  reason?: string;
}
