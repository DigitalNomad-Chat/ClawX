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
