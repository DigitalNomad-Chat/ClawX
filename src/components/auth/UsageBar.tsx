/**
 * UsageBar - 用量进度条
 * 使用 Progress 组件，根据使用量显示不同颜色
 */
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

export interface UsageBarProps {
  feature: 'collaboration' | 'marketplace';
}

export function UsageBar({ feature }: UsageBarProps) {
  const { t } = useTranslation('auth');
  const auth = useAuthStore();

  const tier = auth.tier ?? 'free';

  // pro / enterprise 显示无限或隐藏
  if (tier !== 'free') {
    return (
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {t('usageBar.unlimited') || '无限'}
      </span>
    );
  }

  const usageStats = auth.usageStats ?? [];
  const stat = usageStats.find((s) => s.feature === feature);
  const used = stat?.used ?? 0;
  const limit = stat?.limit ?? 3;

  const ratio = limit > 0 ? used / limit : 0;
  const percentage = Math.min(100, Math.max(0, ratio * 100));

  // 颜色逻辑
  const colorClass =
    ratio < 0.5
      ? 'bg-green-500'
      : ratio < 0.8
        ? 'bg-yellow-500'
        : 'bg-red-500';

  const featureLabel =
    feature === 'collaboration'
      ? t('usageBar.collaboration') || '协作'
      : t('usageBar.marketplace') || '广场';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
        {featureLabel}
      </span>
      <div className="flex-1 min-w-[48px]">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn('h-full w-full flex-1 transition-all', colorClass)}
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          />
        </div>
      </div>
      <span
        className={cn(
          'text-[10px] tabular-nums whitespace-nowrap shrink-0',
          ratio >= 0.8 ? 'text-red-500' : 'text-muted-foreground'
        )}
      >
        {used}/{limit}
      </span>
    </div>
  );
}
