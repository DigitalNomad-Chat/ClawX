import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { UsageInfo } from '@/types/auth';

interface FeatureGuardResult {
  allowed: boolean;
  loading: boolean;
  usageInfo: UsageInfo | null;
  showLimitModal: boolean;
  check: () => Promise<boolean>;
  recordAndCheck: () => Promise<boolean>;
  closeLimitModal: () => void;
}

export function useFeatureGuard(feature: 'collaboration' | 'marketplace'): FeatureGuardResult {
  const auth = useAuthStore();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const check = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      if (auth.isGuest) {
        setAllowed(false);
        setUsageInfo(null);
        setShowLimitModal(true);
        return false;
      }

      const info = await auth.checkFeature(feature);
      setUsageInfo(info as UsageInfo);

      if (!info || !(info as UsageInfo).allowed) {
        setAllowed(false);
        setShowLimitModal(true);
        return false;
      }

      setAllowed(true);
      return true;
    } catch {
      // Network or other errors: treat as not allowed
      setAllowed(false);
      setShowLimitModal(true);
      return false;
    } finally {
      setLoading(false);
    }
  }, [auth, feature]);

  const recordAndCheck = useCallback(async (): Promise<boolean> => {
    const isAllowed = await check();
    if (isAllowed) {
      await auth.recordUsage(feature, undefined);
    }
    return isAllowed;
  }, [check, auth, feature]);

  const closeLimitModal = useCallback(() => {
    setShowLimitModal(false);
  }, []);

  return {
    allowed,
    loading,
    usageInfo,
    showLimitModal,
    check,
    recordAndCheck,
    closeLimitModal,
  };
}
