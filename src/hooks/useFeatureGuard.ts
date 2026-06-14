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

  // Membership restrictions are temporarily disabled; keep the hooks/variables
  // alive so re-enabling only requires restoring the check logic below.
  void feature;
  void auth;
  void setLoading;
  void setUsageInfo;

  // NOTE: Membership restrictions temporarily disabled
  const check = useCallback(async (): Promise<boolean> => {
    setAllowed(true);
    return true;
  }, []);

  const recordAndCheck = useCallback(async (): Promise<boolean> => {
    setAllowed(true);
    return true;
  }, []);

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
