/**
 * UserBadge - 顶部栏用户信息组件
 * 未登录显示登录/注册按钮，已登录显示头像+用户名+会员等级
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoginModal } from './LoginModal';
import {
  LogOut,
  User,
  ChevronDown,
  Crown,
  Zap,
  Building2,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function TierBadge({ tier }: { tier: string }) {
  const variantMap: Record<string, { variant: 'secondary' | 'default' | 'outline'; label: string; icon: React.ReactNode }> = {
    free: { variant: 'secondary', label: 'Free', icon: <User className="h-3 w-3" /> },
    pro: { variant: 'default', label: 'Pro', icon: <Zap className="h-3 w-3" /> },
    enterprise: { variant: 'outline', label: 'Enterprise', icon: <Building2 className="h-3 w-3" /> },
  };
  const config = variantMap[tier] ?? variantMap.free;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'gap-1 text-[10px] px-1.5 py-0',
        tier === 'pro' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800',
        tier === 'enterprise' && 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-100 border-purple-200 dark:border-purple-800'
      )}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-border">
      {initial}
    </div>
  );
}

export function UserBadge({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation('auth');
  const auth = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await auth.logout();
  };

  const handleActivate = () => {
    setMenuOpen(false);
    navigate('/activation');
  };

  // 未登录状态
  if (!auth.isLoggedIn || !auth.userInfo) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          aria-label={t('userBadge.login') || '登录 / 注册'}
          onClick={() => setShowLogin(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowLogin(true);
            }
          }}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200',
            'hover:bg-primary/5 dark:hover:bg-primary/8 text-foreground/80',
            'border-l-[3px] border-l-transparent',
            collapsed ? 'justify-center px-0 border-l-0' : ''
          )}
        >
          <div className={cn("flex items-center gap-2.5", collapsed ? "justify-center w-auto" : "w-full")}>
            <div className="flex shrink-0 items-center justify-center text-muted-foreground">
              <User className="h-[18px] w-[18px]" strokeWidth={2} />
            </div>
            {!collapsed && (
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {t('userBadge.login') || '登录 / 注册'}
              </span>
            )}
          </div>
        </div>
        <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      </>
    );
  }

  const { userInfo, tier, usageStats } = auth;
  const stats = usageStats ?? [];
  const collab = stats.find((s) => s.feature === 'collaboration');
  const market = stats.find((s) => s.feature === 'marketplace');

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
            'hover:bg-primary/5 dark:hover:bg-primary/8',
            collapsed && 'px-0 justify-center'
          )}
        >
          <Avatar name={userInfo.username} url={userInfo.avatarUrl} />
          {!collapsed && (
            <>
              <span className="max-w-[80px] truncate font-medium text-foreground/80">
                {userInfo.username}
              </span>
              <TierBadge tier={tier ?? 'free'} />
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  menuOpen && 'rotate-180'
                )}
              />
            </>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover p-3 shadow-lg">
            {/* 用户信息 */}
            <div className="flex items-center gap-3 pb-3 border-b">
              <Avatar name={userInfo.username} url={userInfo.avatarUrl} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{userInfo.username}</p>
                <p className="text-xs text-muted-foreground truncate">{userInfo.email}</p>
              </div>
            </div>

            {/* 用量统计 */}
            <div className="py-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('userBadge.usageStats') || '本月用量'}
              </p>

              {tier === 'free' ? (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{t('userBadge.collaboration') || '协作大厅'}</span>
                      <span className="tabular-nums">
                        {collab ? `${collab.used}/${collab.limit}` : '-/-'}
                      </span>
                    </div>
                    {collab && (
                      <Progress
                        value={collab.limit > 0 ? (collab.used / collab.limit) * 100 : 0}
                        className="h-1.5"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{t('userBadge.marketplace') || '应用广场'}</span>
                      <span className="tabular-nums">
                        {market ? `${market.used}/${market.limit}` : '-/-'}
                      </span>
                    </div>
                    {market && (
                      <Progress
                        value={market.limit > 0 ? (market.used / market.limit) * 100 : 0}
                        className="h-1.5"
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
                  <Crown className="h-3.5 w-3.5" />
                  <span>{t('userBadge.unlimited') || '无限使用'}</span>
                </div>
              )}
            </div>

            {/* 操作 */}
            <div className="border-t pt-2">
              {tier === 'free' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 mb-1"
                  onClick={handleActivate}
                >
                  <Key className="h-3.5 w-3.5" />
                  {t('userBadge.activateLicense') || '激活 License'}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('userBadge.logout') || '退出登录'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
