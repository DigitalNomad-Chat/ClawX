export type Tier = 'free' | 'pro' | 'enterprise';

export interface UsageInfo {
  feature: 'collaboration' | 'marketplace';
  used: number;
  limit: number;
  remaining: number;
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
