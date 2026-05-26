/**
 * Subscription Tier Configuration
 * Defines feature access, quotas, and limits per tier.
 */
import { Tier, Feature, TierConfig } from './types';

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  free: {
    name: 'free',
    displayName: 'Free',
    monthlyQuota: 3,
    features: [],
    maxDevices: 1,
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    monthlyQuota: 0,
    features: ['collaboration', 'marketplace'],
    maxDevices: 2,
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    monthlyQuota: 0,
    features: ['collaboration', 'marketplace'],
    maxDevices: 5,
  },
};

export function getTierConfig(tier: Tier): TierConfig {
  return TIER_CONFIG[tier] ?? TIER_CONFIG.free;
}

export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  const config = getTierConfig(tier);
  return config.features.includes(feature);
}

export function getFeatureLimit(tier: Tier, _feature: Feature): number | undefined {
  const config = getTierConfig(tier);
  if (!config.features.includes(_feature) && tier !== 'free') {
    return undefined;
  }
  return config.monthlyQuota;
}

export function isSubscriptionActive(sub: { status: string; expires_at: number | null }): boolean {
  if (sub.status !== 'active') return false;
  if (sub.expires_at && sub.expires_at <= Date.now()) return false;
  return true;
}
