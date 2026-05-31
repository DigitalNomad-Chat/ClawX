export type Tier = 'free' | 'pro' | 'enterprise';
export type Feature = 'collaboration' | 'marketplace';

export interface UsageInfo {
  feature: Feature;
  used: number;
  limit: number;
  remaining: number | null;
  tier: Tier;
  allowed?: boolean;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  subscriptionTier: Tier;
  balance: number;
}
