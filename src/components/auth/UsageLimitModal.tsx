/**
 * UsageLimitModal - 使用次数限制弹窗
 * 使用 Sheet 组件作为弹窗基础
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { AlertTriangle, LogIn, ArrowUpCircle } from 'lucide-react';
import { LoginModal } from './LoginModal';

export interface UsageLimitModalProps {
  feature: 'collaboration' | 'marketplace';
  open: boolean;
  onClose: () => void;
}

export function UsageLimitModal({ feature, open, onClose }: UsageLimitModalProps) {
  const { t } = useTranslation('auth');
  const auth = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);

  const isLoggedIn = auth.isLoggedIn;
  const tier = auth.tier ?? 'free';

  const featureName =
    feature === 'collaboration'
      ? t('usageLimitModal.collaboration') || '协作大厅'
      : t('usageLimitModal.marketplace') || '应用广场';

  const usageStats = auth.usageStats ?? [];
  const stat = usageStats.find((s) => s.feature === feature);
  const used = stat?.used ?? 0;
  const limit = stat?.limit ?? 3;

  const handleLoginClick = () => {
    setShowLogin(true);
    onClose();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="bottom" className="w-full sm:max-w-md mx-auto rounded-t-xl">
          <SheetHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <SheetTitle>{t('usageLimitModal.title') || '使用次数已达上限'}</SheetTitle>
            <SheetDescription>
              {t('usageLimitModal.description', { feature: featureName }) ||
                `「${featureName}」本月可用次数已用完`}
            </SheetDescription>
          </SheetHeader>

          <div className="my-6 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {used} / {limit}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('usageLimitModal.usageLabel') || '本月已使用次数'}
            </p>
          </div>

          <SheetFooter className="flex-col gap-2 sm:flex-col">
            {!isLoggedIn ? (
              <Button className="w-full gap-2" onClick={handleLoginClick}>
                <LogIn className="h-4 w-4" />
                {t('usageLimitModal.loginToContinue') || '登录以继续使用'}
              </Button>
            ) : tier === 'free' ? (
              <Button className="w-full gap-2" onClick={onClose}>
                <ArrowUpCircle className="h-4 w-4" />
                {t('usageLimitModal.upgrade') || '升级会员以无限使用'}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={onClose}>
                {t('usageLimitModal.close') || '关闭'}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={onClose}>
              {t('usageLimitModal.close') || '关闭'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}
