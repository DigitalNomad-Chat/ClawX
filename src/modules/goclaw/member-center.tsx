/**
 * GoClaw - 会员中心页面
 * 会员套餐展示、权益对比、订阅管理、激活码兑换
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Check, Crown, Zap, Star, Gift, Clock, Shield,
  Key, Loader2, Sparkles, ArrowRight, RefreshCw,
  AlertCircle, TrendingUp, Users, Globe, Bot,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// ─── 会员套餐数据 ───────────────────────────────────────────────

interface TierPlan {
  id: string;
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  icon: React.ReactNode;
  iconBg: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  discountLabel?: string;
  badge?: string;
  badgeColor?: string;
  features: TierFeature[];
  highlightFeatures: string[];
  ctaLabel: string;
  ctaVariant: 'default' | 'outline' | 'ghost';
  recommended?: boolean;
}

interface TierFeature {
  text: string;
  included: boolean;
  condition?: string;
}

const TIER_PLANS: TierPlan[] = [
  {
    id: 'free',
    tier: 'free',
    name: '免费体验',
    icon: <Star className="h-5 w-5" />,
    iconBg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    description: '适合个人尝试，体验核心 AI 能力',
    priceMonthly: '免费',
    priceYearly: '免费',
    features: [
      { text: '每月 3 次协作大厅任务', included: true },
      { text: '每月 3 次应用广场 Agent 试用', included: true },
      { text: '基础 AI 对话能力', included: true },
      { text: '本地知识库', included: false, condition: '升级获取' },
      { text: '自定义 Agent 创建', included: false, condition: '升级获取' },
      { text: '优先模型接入', included: false, condition: '升级获取' },
      { text: '团队协作空间', included: false, condition: '升级获取' },
      { text: 'API 访问权限', included: false, condition: '升级获取' },
    ],
    highlightFeatures: [],
    ctaLabel: '当前方案',
    ctaVariant: 'ghost',
  },
  {
    id: 'pro',
    tier: 'pro',
    name: '专业版',
    icon: <Zap className="h-5 w-5" />,
    iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    description: '适合个人专业人士，解锁全部核心功能',
    priceMonthly: '¥68/月',
    priceYearly: '¥588/年',
    discountLabel: '省¥228/年',
    badge: '最受欢迎',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    features: [
      { text: '每月 50 次协作大厅任务', included: true },
      { text: '每月 50 次应用广场 Agent 试用', included: true },
      { text: '高级 AI 对话能力', included: true },
      { text: '本地知识库（不限容量）', included: true },
      { text: '自定义 Agent 创建', included: true },
      { text: '优先模型接入', included: true },
      { text: '团队协作空间（最多 5 人）', included: false, condition: '升级企业版' },
      { text: 'API 访问权限', included: false, condition: '升级企业版' },
    ],
    highlightFeatures: ['自定义 Agent', '知识库', '优先模型'],
    ctaLabel: '立即升级',
    ctaVariant: 'default',
    recommended: true,
  },
  {
    id: 'enterprise',
    tier: 'enterprise',
    name: '企业版',
    icon: <Shield className="h-5 w-5" />,
    iconBg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
    description: '适合团队和企业，完整协作与管理能力',
    priceMonthly: '联系销售',
    priceYearly: '联系销售',
    badge: '团队首选',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    features: [
      { text: '无限协作大厅任务', included: true },
      { text: '无限应用广场 Agent 试用', included: true },
      { text: '最高级 AI 对话能力', included: true },
      { text: '企业级知识库', included: true },
      { text: '自定义 Agent 创建', included: true },
      { text: '专属模型接入', included: true },
      { text: '团队协作空间（不限人数）', included: true },
      { text: 'API 访问权限', included: true },
    ],
    highlightFeatures: ['无限用量', '团队协作', 'API 权限'],
    ctaLabel: '联系销售',
    ctaVariant: 'outline',
  },
];

// ─── 权益对比表 ─────────────────────────────────────────────────

interface ComparisonRow {
  feature: string;
  icon?: React.ReactNode;
  free: string;
  pro: string;
  enterprise: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: '协作大厅任务', icon: <Users className="h-4 w-4" />, free: '3 次/月', pro: '50 次/月', enterprise: '无限' },
  { feature: 'Agent 试用', icon: <Bot className="h-4 w-4" />, free: '3 次/月', pro: '50 次/月', enterprise: '无限' },
  { feature: 'AI 对话额度', icon: <Sparkles className="h-4 w-4" />, free: '基础', pro: '高级', enterprise: '最高级' },
  { feature: '本地知识库', icon: <Globe className="h-4 w-4" />, free: '不支持', pro: '不限容量', enterprise: '企业级' },
  { feature: '自定义 Agent', icon: <Bot className="h-4 w-4" />, free: '不支持', pro: '支持', enterprise: '支持' },
  { feature: '优先模型接入', icon: <TrendingUp className="h-4 w-4" />, free: '不支持', pro: '支持', enterprise: '专属模型' },
  { feature: '团队协作', icon: <Users className="h-4 w-4" />, free: '不支持', pro: '最多 5 人', enterprise: '不限人数' },
  { feature: 'API 访问', icon: <Key className="h-4 w-4" />, free: '不支持', pro: '不支持', enterprise: '支持' },
  { feature: '技术支持', icon: <Clock className="h-4 w-4" />, free: '社区', pro: '邮件', enterprise: '专属经理' },
];

// ─── 区块 1: Hero Banner ────────────────────────────────────────

function HeroBanner({ currentTier }: { currentTier: string }) {
  const { t } = useTranslation('member');
  const isFree = currentTier === 'free';
  const isPro = currentTier === 'pro';

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl p-8 md:p-10',
      'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700',
      'text-white'
    )}>
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Crown className="h-8 w-8 text-yellow-300" />
              <h1 className="text-3xl md:text-4xl font-bold">{t('memberCenter.hero.title')}</h1>
            </div>
            <p className="text-lg text-white/80 max-w-xl">
              {isFree && t('memberCenter.hero.freeDescription')}
              {isPro && t('memberCenter.hero.proDescription')}
              {isPro && (
                <span className="inline-block mt-2 px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-200 text-sm font-medium">
                  {t('memberCenter.hero.proBadge')}
                </span>
              )}
              {currentTier === 'enterprise' && t('memberCenter.hero.enterpriseDescription')}
            </p>
          </div>

          {isFree && (
            <div className="flex-shrink-0 text-center">
              <div className="text-5xl font-bold text-yellow-300">¥68</div>
              <div className="text-white/70 text-sm mt-1">{t('memberCenter.hero.startFrom')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 区块 2: 套餐卡片 ───────────────────────────────────────────

function TierCards({
  currentTier,
  billingCycle,
  onUpgrade,
  isActivating,
}: {
  currentTier: string;
  billingCycle: 'monthly' | 'yearly';
  onUpgrade: (tier: string) => void;
  isActivating: boolean;
}) {
  const { t } = useTranslation('member');

  return (
    <section aria-label={t('memberCenter.tiers.title')}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('memberCenter.tiers.title')}</h2>
        <Tabs value={billingCycle} className="w-auto" onValueChange={() => { }}>
          <TabsList>
            <TabsTrigger value="monthly">{t('memberCenter.tiers.monthly')}</TabsTrigger>
            <TabsTrigger value="yearly">{t('memberCenter.tiers.yearly')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIER_PLANS.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const price = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col transition-all',
                plan.recommended && 'ring-2 ring-blue-500 shadow-lg',
                isCurrent && 'ring-2 ring-green-500 bg-green-50/50 dark:bg-green-900/10'
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="secondary" className={plan.badgeColor}>
                    {plan.badge}
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="default" className="bg-green-600">
                    <Check className="h-3 w-3 mr-1" />
                    当前方案
                  </Badge>
                </div>
              )}

              <CardHeader>
                <div className={cn('inline-flex rounded-lg p-2 mb-2', plan.iconBg)}>
                  {plan.icon}
                </div>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-4">
                  <span className="text-3xl font-bold">{price}</span>
                  {plan.discountLabel && (
                    <span className="ml-2 text-xs text-orange-600 font-medium">{plan.discountLabel}</span>
                  )}
                </div>

                <Separator className="my-4" />

                <ul className="space-y-2.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 mt-0.5 shrink-0 rounded-full border border-muted-foreground/30" />
                      )}
                      <span className={f.included ? 'text-foreground' : 'text-muted-foreground'}>
                        {f.text}
                        {f.condition && (
                          <span className="ml-1 text-xs text-muted-foreground/70">({f.condition})</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <div className="p-4 pt-0 mt-auto">
                <Button
                  className="w-full"
                  variant={isCurrent ? 'ghost' : plan.ctaVariant}
                  disabled={isCurrent || isActivating}
                  onClick={() => onUpgrade(plan.tier)}
                >
                  {isActivating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {plan.ctaLabel}
                  {!isCurrent && <ArrowRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ─── 区块 3: 权益对比表 ─────────────────────────────────────────

function ComparisonTable() {
  const { t } = useTranslation('member');

  return (
    <section aria-label={t('memberCenter.comparison.title')}>
      <h2 className="text-xl font-semibold mb-6">{t('memberCenter.comparison.title')}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4 font-semibold">{t('memberCenter.comparison.feature')}</th>
              <th className="text-center py-3 px-4 font-medium text-muted-foreground">Free</th>
              <th className="text-center py-3 px-4 font-medium text-blue-600 dark:text-blue-400">Pro</th>
              <th className="text-center py-3 px-4 font-medium text-purple-600 dark:text-purple-400">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, i) => (
              <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {row.icon}
                    <span>{row.feature}</span>
                  </div>
                </td>
                <td className="text-center py-3 px-4 text-muted-foreground">{row.free}</td>
                <td className="text-center py-3 px-4 font-medium">{row.pro}</td>
                <td className="text-center py-3 px-4 font-medium">{row.enterprise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 区块 4: 会员专属权益 ───────────────────────────────────────

function ExclusiveBenefits() {
  const { t } = useTranslation('member');

  const benefits = [
    {
      icon: <Gift className="h-6 w-6" />,
      iconBg: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
      title: t('memberCenter.benefits.exclusiveAgent.title'),
      desc: t('memberCenter.benefits.exclusiveAgent.desc'),
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      iconBg: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      title: t('memberCenter.benefits.priorityAccess.title'),
      desc: t('memberCenter.benefits.priorityAccess.desc'),
    },
    {
      icon: <RefreshCw className="h-6 w-6" />,
      iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      title: t('memberCenter.benefits.earlyAccess.title'),
      desc: t('memberCenter.benefits.earlyAccess.desc'),
    },
    {
      icon: <Users className="h-6 w-6" />,
      iconBg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      title: t('memberCenter.benefits.community.title'),
      desc: t('memberCenter.benefits.community.desc'),
    },
  ];

  return (
    <section aria-label={t('memberCenter.benefits.title')}>
      <h2 className="text-xl font-semibold mb-6">{t('memberCenter.benefits.title')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {benefits.map((b, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className={cn('inline-flex rounded-lg p-2.5 mb-3', b.iconBg)}>
                {b.icon}
              </div>
              <h3 className="font-semibold text-sm mb-1">{b.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ─── 区块 5: 订阅管理 ───────────────────────────────────────────

function SubscriptionManagement({ currentTier }: { currentTier: string }) {
  const { t } = useTranslation('member');

  const isFree = currentTier === 'free';
  const isPro = currentTier === 'pro';

  // 模拟订阅信息
  const subscription = {
    tier: currentTier,
    startDate: '2024-01-15',
    renewDate: isPro ? '2025-07-15' : undefined,
    plan: isPro ? '年度' : undefined,
    autoRenew: isPro,
  };

  if (isFree) {
    return (
      <section aria-label={t('memberCenter.subscription.title')}>
        <h2 className="text-xl font-semibold mb-6">{t('memberCenter.subscription.title')}</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Crown className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">
                {t('memberCenter.subscription.notSubscribed')}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                {t('memberCenter.subscription.upgradeToManage')}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={t('memberCenter.subscription.title')}>
      <h2 className="text-xl font-semibold mb-6">{t('memberCenter.subscription.title')}</h2>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* 当前方案 */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm text-muted-foreground">{t('memberCenter.subscription.currentPlan')}</p>
                <p className="text-lg font-semibold">
                  {subscription.tier === 'pro' ? t('memberCenter.tiers.proName') : t('memberCenter.tiers.enterpriseName')}
                </p>
              </div>
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                活跃
              </Badge>
            </div>

            {/* 订阅详情 */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('memberCenter.subscription.startDate')}</p>
                <p className="font-medium">{subscription.startDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('memberCenter.subscription.renewDate')}</p>
                <p className="font-medium">{subscription.renewDate || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('memberCenter.subscription.plan')}</p>
                <p className="font-medium">{subscription.plan}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('memberCenter.subscription.autoRenew')}</p>
                <p className="font-medium">{subscription.autoRenew ? t('memberCenter.subscription.enabled') : t('memberCenter.subscription.disabled')}</p>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" size="sm">
                {t('memberCenter.subscription.changePlan')}
              </Button>
              <Button variant="outline" size="sm">
                {t('memberCenter.subscription.pause')}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                {t('memberCenter.subscription.cancel')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ─── 区块 6: 激活码兑换 ─────────────────────────────────────────

function ActivationPanel({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useTranslation('member');
  const [code, setCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; tier?: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleActivate = async () => {
    if (!code.trim()) {
      setResult({ success: false, message: t('memberCenter.activation.emptyCode') });
      return;
    }

    setIsActivating(true);
    setResult(null);

    try {
      const res = await useAuthStore.getState().activateLicense(code.trim());
      if (res.success) {
        // Refresh user info to pick up new tier
        await useAuthStore.getState().refreshUser();
        const newTier = useAuthStore.getState().tier;
        const tierLabel = newTier === 'pro' ? t('memberCenter.tiers.proName') : newTier === 'enterprise' ? t('memberCenter.tiers.enterpriseName') : '';
        setResult({
          success: true,
          message: tierLabel ? `${t('memberCenter.activation.success')} — ${tierLabel}` : t('memberCenter.activation.success'),
          tier: newTier ?? undefined,
        });
        setCode('');
      } else {
        setResult({ success: false, message: res.reason || t('memberCenter.activation.failed') });
      }
    } catch (err: any) {
      setResult({ success: false, message: err?.message || t('memberCenter.activation.error') });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <section aria-label={t('memberCenter.activation.title')}>
      <h2 className="text-xl font-semibold mb-6">{t('memberCenter.activation.title')}</h2>

      {!isLoggedIn ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <Key className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">
                {t('memberCenter.activation.loginRequired')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder={t('memberCenter.activation.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                  disabled={isActivating}
                  className="font-mono tracking-wider"
                />
                <Button
                  onClick={() => setShowConfirm(true)}
                  disabled={isActivating || !code.trim()}
                >
                  {isActivating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('memberCenter.activation.activate')}
                </Button>
              </div>

              {result && (
                <div className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
                  result.success
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                )}>
                  {result.success ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{result.message}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t('memberCenter.activation.hint')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={showConfirm}
        title={t('memberCenter.activation.confirmTitle')}
        message={t('memberCenter.activation.confirmMessage')}
        confirmLabel={t('memberCenter.activation.activate')}
        cancelLabel={t('memberCenter.activation.cancel')}
        variant="default"
        onConfirm={handleActivate}
        onCancel={() => setShowConfirm(false)}
      />
    </section>
  );
}

// ─── FAQ 区域 ───────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: '可以随时取消订阅吗？',
    answer: '是的，您可以随时取消订阅。取消后，您当前的付费权益将持续到本期结束。',
  },
  {
    question: '支持哪些支付方式？',
    answer: '目前支持微信支付、支付宝和银行卡支付。企业版支持对公转账和发票开具。',
  },
  {
    question: '升级/降级何时生效？',
    answer: '升级立即生效，差额按剩余天数折算。降级在当前计费周期结束后生效。',
  },
  {
    question: '激活码在哪里购买？',
    answer: '激活码可通过官网商城、授权经销商购买，也可通过联系我们获取定制方案。',
  },
];

function FAQSection() {
  const { t } = useTranslation('member');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section aria-label={t('memberCenter.faq.title')}>
      <h2 className="text-xl font-semibold mb-6">{t('memberCenter.faq.title')}</h2>
      <div className="space-y-2">
        {FAQ_DATA.map((faq, i) => (
          <Card
            key={i}
            className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{faq.question}</CardTitle>
                <ChevronDownIcon
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ml-2',
                    openIndex === i && 'rotate-180'
                  )}
                />
              </div>
            </CardHeader>
            {openIndex === i && (
              <CardContent className="pt-0 pb-4 px-5">
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return <ChevronDown className={className} />;
}

// ─── 主组件 ─────────────────────────────────────────────────────

export function GoClawMemberCenter() {
  const auth = useAuthStore();
  const [billingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const currentTier = auth.tier ?? 'free';
  void auth; // used for currentTier and isLoggedIn below
  const isLoggedIn = auth.isLoggedIn;

  const handleUpgrade = (tier: string) => {
    if (!auth.isLoggedIn) {
      // TODO: 打开登录弹窗
      return;
    }
    if (tier === 'free') return;
    // TODO: 调用支付/升级 API
    alert(`升级到 ${tier} 功能开发中`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-10">
      <HeroBanner currentTier={currentTier} />
      <TierCards
        currentTier={currentTier}
        billingCycle={billingCycle}
        onUpgrade={handleUpgrade}
        isActivating={false}
      />
      <ComparisonTable />
      <ExclusiveBenefits />
      <SubscriptionManagement currentTier={currentTier} />
      <ActivationPanel isLoggedIn={isLoggedIn} />
      <FAQSection />
    </div>
  );
}
