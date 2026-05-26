# 独立会员体系后续任务 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成独立会员体系的前端 UX 增强、安全加固和测试重写，使系统达到生产可用状态。

**Architecture:** 前端激活页面 + auth store + IPC 通道对接；JWT Secret 使用 Electron safeStorage 加密；重写因 API 变更而过时的单元测试。

**Tech Stack:** React 19 + Zustand 5 + Electron safeStorage + Vitest + better-sqlite3 (mocked)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/i18n/locales/en/auth.json` | Modify | 新增 activation i18n keys (英文) |
| `src/i18n/locales/zh/auth.json` | Modify | 新增 activation i18n keys (中文) |
| `src/i18n/locales/ja/auth.json` | Modify | 新增 activation i18n keys (日文) |
| `src/i18n/locales/ru/auth.json` | Modify | 新增 activation i18n keys (俄文) |
| `src/stores/auth.ts` | Modify | 新增 `activateLicense` 方法 |
| `src/pages/ActivationPage.tsx` | Rewrite | 使用 `auth:activate` IPC 替换 native licenseAPI |
| `src/components/auth/UserBadge.tsx` | Modify | 下拉菜单新增"激活 License"入口 |
| `electron/services/member/local-auth.ts` | Modify | JWT Secret 使用 safeStorage 加密存储 |
| `tests/unit/member/usage-counter.test.ts` | Rewrite | 适配新 API 签名 (userId 参数) |
| `tests/unit/member/token-manager.test.ts` | Rewrite | 适配新 API 签名 (本地 JWT) |

---

## Chunk 1: Frontend UX Enhancement (Phase 3)

### Task 1: i18n Activation Keys

**Files:**
- Modify: `src/i18n/locales/en/auth.json`
- Modify: `src/i18n/locales/zh/auth.json`
- Modify: `src/i18n/locales/ja/auth.json`
- Modify: `src/i18n/locales/ru/auth.json`

- [ ] **Step 1: Add activation i18n keys to all 4 locale files**

`src/i18n/locales/en/auth.json` — add `activation` section after `loginModal`:

```json
{
  "userBadge": {
    "login": "Sign In / Register",
    "usageStats": "Monthly Usage",
    "collaboration": "Collaboration",
    "marketplace": "Marketplace",
    "unlimited": "Unlimited",
    "logout": "Log Out",
    "activateLicense": "Activate License"
  },
  "usageBar": {
    "collaboration": "Collab",
    "marketplace": "Market",
    "unlimited": "Unlimited"
  },
  "usageLimitModal": {
    "title": "Usage Limit Reached",
    "description": "Your monthly quota for {{feature}} has been used up",
    "usageLabel": "Used this month",
    "collaboration": "Collaboration Hall",
    "marketplace": "Marketplace",
    "loginToContinue": "Sign in to continue",
    "upgrade": "Upgrade for unlimited access",
    "close": "Close"
  },
  "loginModal": {
    "title": "Welcome Back",
    "subtitle": "Sign in to unlock all features",
    "loginTab": "Sign In",
    "registerTab": "Register",
    "username": "Username",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "loginButton": "Sign In",
    "registerButton": "Register",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "usernameRequired": "Username is required",
    "passwordRequired": "Password is required",
    "emailRequired": "Email is required",
    "passwordMismatch": "Passwords do not match",
    "loginSuccess": "Signed in successfully",
    "registerSuccess": "Registered successfully",
    "loginFailed": "Sign in failed",
    "registerFailed": "Registration failed"
  },
  "activation": {
    "title": "Activate License",
    "subtitle": "Enter your license key to upgrade",
    "inputLabel": "License Key",
    "inputPlaceholder": "CLWX-XXXX-XXXX-XXXX",
    "activateButton": "Activate",
    "activating": "Activating...",
    "success": "License activated successfully!",
    "notLoggedIn": "Please sign in first",
    "loginFirst": "You need to sign in before activating a license",
    "invalidKey": "Invalid or expired license key",
    "networkError": "Network error, please check your connection",
    "backToHome": "Back to Home",
    "goToLogin": "Sign In"
  }
}
```

`src/i18n/locales/zh/auth.json` — add `activation` section and `activateLicense` key:

```json
{
  "userBadge": {
    "login": "登录 / 注册",
    "usageStats": "本月用量",
    "collaboration": "协作大厅",
    "marketplace": "应用广场",
    "unlimited": "无限使用",
    "logout": "退出登录",
    "activateLicense": "激活 License"
  },
  "usageBar": {
    "collaboration": "协作",
    "marketplace": "广场",
    "unlimited": "无限"
  },
  "usageLimitModal": {
    "title": "使用次数已达上限",
    "description": "「{{feature}}」本月可用次数已用完",
    "usageLabel": "本月已使用次数",
    "collaboration": "协作大厅",
    "marketplace": "应用广场",
    "loginToContinue": "登录以继续使用",
    "upgrade": "升级会员以无限使用",
    "close": "关闭"
  },
  "loginModal": {
    "title": "欢迎回来",
    "subtitle": "登录后即可使用全部功能",
    "loginTab": "登录",
    "registerTab": "注册",
    "username": "用户名",
    "email": "邮箱",
    "password": "密码",
    "confirmPassword": "确认密码",
    "loginButton": "登录",
    "registerButton": "注册",
    "noAccount": "还没有账号？",
    "hasAccount": "已有账号？",
    "usernameRequired": "请输入用户名",
    "passwordRequired": "请输入密码",
    "emailRequired": "请输入邮箱",
    "passwordMismatch": "两次输入的密码不一致",
    "loginSuccess": "登录成功",
    "registerSuccess": "注册成功",
    "loginFailed": "登录失败",
    "registerFailed": "注册失败"
  },
  "activation": {
    "title": "激活 License",
    "subtitle": "输入授权码以升级您的会员等级",
    "inputLabel": "授权码",
    "inputPlaceholder": "CLWX-XXXX-XXXX-XXXX",
    "activateButton": "激活",
    "activating": "激活中...",
    "success": "授权激活成功！",
    "notLoggedIn": "请先登录",
    "loginFirst": "您需要先登录才能激活授权码",
    "invalidKey": "授权码无效或已过期",
    "networkError": "网络错误，请检查网络连接",
    "backToHome": "返回首页",
    "goToLogin": "去登录"
  }
}
```

`src/i18n/locales/ja/auth.json`:

```json
{
  "userBadge": {
    "login": "ログイン / 登録",
    "usageStats": "今月の使用量",
    "collaboration": "コラボレーション",
    "marketplace": "マーケットプレイス",
    "unlimited": "無制限",
    "logout": "ログアウト",
    "activateLicense": "ライセンス認証"
  },
  "usageBar": {
    "collaboration": "コラボ",
    "marketplace": "マーケット",
    "unlimited": "無制限"
  },
  "usageLimitModal": {
    "title": "使用回数の上限に達しました",
    "description": "「{{feature}}」の今月の使用回数が上限に達しました",
    "usageLabel": "今月の使用回数",
    "collaboration": "コラボレーション",
    "marketplace": "マーケットプレイス",
    "loginToContinue": "続けるにはログイン",
    "upgrade": "無制限にするにはアップグレード",
    "close": "閉じる"
  },
  "loginModal": {
    "title": "お帰りなさい",
    "subtitle": "ログインしてすべての機能を利用",
    "loginTab": "ログイン",
    "registerTab": "登録",
    "username": "ユーザー名",
    "email": "メール",
    "password": "パスワード",
    "confirmPassword": "パスワード確認",
    "loginButton": "ログイン",
    "registerButton": "登録",
    "noAccount": "アカウントをお持ちでないですか？",
    "hasAccount": "すでにアカウントをお持ちですか？",
    "usernameRequired": "ユーザー名を入力してください",
    "passwordRequired": "パスワードを入力してください",
    "emailRequired": "メールを入力してください",
    "passwordMismatch": "パスワードが一致しません",
    "loginSuccess": "ログイン成功",
    "registerSuccess": "登録成功",
    "loginFailed": "ログイン失敗",
    "registerFailed": "登録失敗"
  },
  "activation": {
    "title": "ライセンス認証",
    "subtitle": "ライセンスキーを入力してアップグレード",
    "inputLabel": "ライセンスキー",
    "inputPlaceholder": "CLWX-XXXX-XXXX-XXXX",
    "activateButton": "認証",
    "activating": "認証中...",
    "success": "ライセンス認証に成功しました！",
    "notLoggedIn": "先にログインしてください",
    "loginFirst": "ライセンス認証にはログインが必要です",
    "invalidKey": "無効または期限切れのライセンスキー",
    "networkError": "ネットワークエラー、接続を確認してください",
    "backToHome": "ホームに戻る",
    "goToLogin": "ログイン"
  }
}
```

`src/i18n/locales/ru/auth.json`:

```json
{
  "userBadge": {
    "login": "Войти / Регистрация",
    "usageStats": "Использование за месяц",
    "collaboration": "Коллаборация",
    "marketplace": "Маркетплейс",
    "unlimited": "Безлимит",
    "logout": "Выйти",
    "activateLicense": "Активировать лицензию"
  },
  "usageBar": {
    "collaboration": "Коллаб",
    "marketplace": "Маркет",
    "unlimited": "Безлимит"
  },
  "usageLimitModal": {
    "title": "Достигнут лимит использования",
    "description": "Месячный лимит для «{{feature}}» исчерпан",
    "usageLabel": "Использовано в этом месяце",
    "collaboration": "Коллаборация",
    "marketplace": "Маркетплейс",
    "loginToContinue": "Войти, чтобы продолжить",
    "upgrade": "Обновить для безлимита",
    "close": "Закрыть"
  },
  "loginModal": {
    "title": "С возвращением",
    "subtitle": "Войдите, чтобы получить доступ ко всем функциям",
    "loginTab": "Вход",
    "registerTab": "Регистрация",
    "username": "Имя пользователя",
    "email": "Email",
    "password": "Пароль",
    "confirmPassword": "Подтвердите пароль",
    "loginButton": "Войти",
    "registerButton": "Зарегистрироваться",
    "noAccount": "Нет аккаунта?",
    "hasAccount": "Уже есть аккаунт?",
    "usernameRequired": "Введите имя пользователя",
    "passwordRequired": "Введите пароль",
    "emailRequired": "Введите email",
    "passwordMismatch": "Пароли не совпадают",
    "loginSuccess": "Вход выполнен",
    "registerSuccess": "Регистрация успешна",
    "loginFailed": "Ошибка входа",
    "registerFailed": "Ошибка регистрации"
  },
  "activation": {
    "title": "Активация лицензии",
    "subtitle": "Введите ключ лицензии для обновления",
    "inputLabel": "Ключ лицензии",
    "inputPlaceholder": "CLWX-XXXX-XXXX-XXXX",
    "activateButton": "Активировать",
    "activating": "Активация...",
    "success": "Лицензия успешно активирована!",
    "notLoggedIn": "Сначала войдите",
    "loginFirst": "Для активации лицензии необходимо войти",
    "invalidKey": "Недействительный или просроченный ключ",
    "networkError": "Ошибка сети, проверьте подключение",
    "backToHome": "На главную",
    "goToLogin": "Войти"
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh/auth.json','utf8'))" && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/*/auth.json
git commit -m "feat(i18n): add activation page and license key i18n keys"
```

---

### Task 2: Auth Store activateLicense Method

**Files:**
- Modify: `src/stores/auth.ts`

- [ ] **Step 1: Add `activateLicense` to `AuthState` interface and implementation**

In `src/stores/auth.ts`, add `ActivateResult` type and `activateLicense` method:

Add after the existing `RegisterResult` interface:

```typescript
export interface ActivateResult {
  success: boolean;
  reason?: string;
}
```

Add to `AuthState` interface (after `recordUsage`):

```typescript
  activateLicense: (licenseKey: string) => Promise<ActivateResult>;
```

Add implementation inside the `create<AuthState>((set, get) => ({...}))` callback, after `recordUsage`:

```typescript
  activateLicense: async (licenseKey) => {
    const user = get().userInfo;
    if (!user) {
      return { success: false, reason: 'Not logged in' };
    }

    set({ isLoading: true });
    try {
      const result = await invokeIpc<{ success: boolean; tier?: string; expiresAt?: number; reason?: string }>(
        'auth:activate',
        { licenseKey, userId: user.id },
      );
      if (result?.success) {
        // Re-fetch user info to pick up new tier
        const updatedUser = await invokeIpc<UserInfo>('auth:getUser');
        const usageStats = await invokeIpc<UsageInfo[]>('auth:getUsageStats');
        set({
          userInfo: updatedUser,
          tier: updatedUser?.subscriptionTier ?? null,
          usageStats,
          isLoggedIn: !!updatedUser,
          isGuest: !updatedUser,
        });
        return { success: true };
      }
      return { success: false, reason: result?.reason || 'Activation failed' };
    } catch (err: any) {
      return { success: false, reason: err?.message || 'Network error' };
    } finally {
      set({ isLoading: false });
    }
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "src/stores/auth" || echo "No errors in auth store"`
Expected: "No errors in auth store" (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add src/stores/auth.ts
git commit -m "feat(auth): add activateLicense method to auth store"
```

---

### Task 3: Rewrite ActivationPage

**Files:**
- Rewrite: `src/pages/ActivationPage.tsx`

- [ ] **Step 1: Write the complete new ActivationPage**

Replace entire content of `src/pages/ActivationPage.tsx`:

```tsx
/**
 * Activation Page
 * Allows logged-in users to activate a License Key to upgrade their tier.
 * Replaces the old native C++ licenseAPI with auth:activate IPC.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type ActivateResult } from '@/stores/auth';

const ActivationPage: React.FC = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const auth = useAuthStore();
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    const trimmed = licenseKey.trim();
    if (!trimmed) {
      setError(t('activation.invalidKey') || '请输入授权码');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const result: ActivateResult = await auth.activateLicense(trimmed);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => navigate('/'), 1500);
      } else {
        setError(result.reason || t('activation.invalidKey') || '激活失败');
      }
    } catch {
      setError(t('activation.networkError') || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleActivate();
    }
  };

  // 未登录状态：提示登录
  if (!auth.isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-bold">{t('activation.notLoggedIn') || '请先登录'}</h1>
          <p className="text-gray-400">
            {t('activation.loginFirst') || '您需要先登录才能激活授权码'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
          >
            {t('activation.goToLogin') || '去登录'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('activation.title') || '激活 License'}</h1>
          <p className="text-gray-400">
            {t('activation.subtitle') || '输入授权码以升级您的会员等级'}
          </p>
        </div>

        {/* 当前用户信息 */}
        {auth.userInfo && (
          <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold">
              {auth.userInfo.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">{auth.userInfo.username}</p>
              <p className="text-xs text-gray-400">
                {auth.tier === 'free' ? 'Free' : auth.tier === 'pro' ? 'Pro' : 'Enterprise'}
              </p>
            </div>
          </div>
        )}

        {/* License Key 输入 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm text-gray-400 mb-2">
            {t('activation.inputLabel') || '授权码'}
          </label>
          <input
            type="text"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder={t('activation.inputPlaceholder') || 'CLWX-XXXX-XXXX-XXXX'}
            className="w-full bg-gray-900 rounded px-3 py-2.5 text-sm font-mono text-white placeholder-gray-600 border border-gray-700 focus:border-blue-500 focus:outline-none transition"
            disabled={loading || success}
            maxLength={17}
          />
        </div>

        {/* 成功提示 */}
        {success && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-3 text-green-300 text-sm text-center">
            {t('activation.success') || '授权激活成功！'}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* 激活按钮 */}
        <button
          onClick={handleActivate}
          disabled={loading || success}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition"
        >
          {loading
            ? (t('activation.activating') || '激活中...')
            : (t('activation.activateButton') || '激活')
          }
        </button>

        {/* 返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className="w-full py-2 text-sm text-gray-400 hover:text-white transition"
        >
          {t('activation.backToHome') || '返回首页'}
        </button>
      </div>
    </div>
  );
};

export default ActivationPage;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "src/pages/Activation" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 3: Commit**

```bash
git add src/pages/ActivationPage.tsx
git commit -m "feat(activation): rewrite ActivationPage to use auth:activate IPC"
```

---

### Task 4: UserBadge Activate Entry

**Files:**
- Modify: `src/components/auth/UserBadge.tsx`

- [ ] **Step 1: Add imports for navigation and Key icon**

At the top of `src/components/auth/UserBadge.tsx`, add `useNavigate` import and `Key` icon:

In the imports, add `useNavigate` from `react-router-dom`:
```typescript
import { useNavigate } from 'react-router-dom';
```

Add `Key` to the lucide-react imports:
```typescript
import {
  LogOut,
  User,
  ChevronDown,
  Crown,
  Zap,
  Building2,
  Key,
} from 'lucide-react';
```

- [ ] **Step 2: Add navigation hook and activate handler**

Inside the `UserBadge` function (after `const menuRef = useRef<HTMLDivElement>(null);`), add:

```typescript
  const navigate = useNavigate();
```

After `handleLogout`, add:
```typescript
  const handleActivate = () => {
    setMenuOpen(false);
    navigate('/activation');
  };
```

- [ ] **Step 3: Add "Activate License" button in dropdown menu**

In the dropdown menu's action section (`<div className="border-t pt-2">`), add the activate button BEFORE the logout button. The logout `<Button>` block starts with `<Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-destructive..."`.

Insert BEFORE the logout button:

```tsx
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
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "src/components/auth/UserBadge" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/UserBadge.tsx
git commit -m "feat(userBadge): add 'Activate License' entry for free-tier users"
```

---

## Chunk 2: Security Hardening (Phase 2)

### Task 5: Encrypt JWT Secret with Electron safeStorage

**Files:**
- Modify: `electron/services/member/local-auth.ts`

- [ ] **Step 1: Update getJwtSecret() to use Electron safeStorage**

In `electron/services/member/local-auth.ts`, add `safeStorage` import:

```typescript
import { safeStorage } from 'electron';
```

Replace the entire `getJwtSecret()` function (lines 19-41) with:

```typescript
function getJwtSecret(): string {
  if (jwtSecret) return jwtSecret;

  const secretPath = path.join(app.getPath('userData'), JWT_SECRET_FILENAME);

  try {
    if (fs.existsSync(secretPath)) {
      const raw = fs.readFileSync(secretPath);
      if (safeStorage.isEncryptionAvailable()) {
        // Encrypted format: safeStorage.encryptString() produces a Buffer
        try {
          jwtSecret = safeStorage.decryptString(raw);
          return jwtSecret;
        } catch {
          // Might be a legacy plaintext file from before this change
          jwtSecret = raw.toString('utf8').trim();
          // Re-encrypt on next write
          return jwtSecret;
        }
      }
      // Fallback: plaintext (Linux without keyring, etc.)
      jwtSecret = raw.toString('utf8').trim();
      return jwtSecret;
    }
  } catch {
    // fall through to generation
  }

  jwtSecret = crypto.randomBytes(32).toString('hex');
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(jwtSecret);
      fs.writeFileSync(secretPath, encrypted, { mode: 0o600 });
    } else {
      fs.writeFileSync(secretPath, jwtSecret, { mode: 0o600 });
    }
  } catch (err) {
    logger.warn('[LocalAuth] Failed to persist JWT secret to disk:', err);
  }

  return jwtSecret;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "electron/services/member/local-auth" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/local-auth.ts
git commit -m "feat(security): encrypt JWT secret with Electron safeStorage"
```

---

## Chunk 3: Testing (Phase 4)

### Task 6: Rewrite UsageCounter Tests

**Files:**
- Rewrite: `tests/unit/member/usage-counter.test.ts`

The existing test references stale API (`TokenSnapshot`, `syncToServer`, `checkOfflineBudget`, `getCount(feature)` without userId). Must be completely rewritten.

- [ ] **Step 1: Write the new test file**

Replace entire content of `tests/unit/member/usage-counter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Feature } from '@electron/services/member/types';

// Mock database
let mockUsageData: { user_id: string; feature: string; year_month: string; used_count: number }[] = [];

vi.mock('@electron/services/member/database', () => ({
  initMemberDatabase: vi.fn(),
  getMemberDatabase: vi.fn(() => ({
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT used_count')) {
        return {
          get: vi.fn((userId: string, feature: string, yearMonth: string) => {
            const row = mockUsageData.find(
              (r) => r.user_id === userId && r.feature === feature && r.year_month === yearMonth,
            );
            return row ?? undefined;
          }),
        };
      }
      if (sql.includes('INSERT INTO feature_usage')) {
        return {
          run: vi.fn((userId: string, feature: string, yearMonth: string) => {
            const existing = mockUsageData.find(
              (r) => r.user_id === userId && r.feature === feature && r.year_month === yearMonth,
            );
            if (existing) {
              existing.used_count += 1;
            } else {
              mockUsageData.push({ user_id: userId, feature, year_month: yearMonth, used_count: 1 });
            }
            return { changes: 1 };
          }),
        };
      }
      if (sql.includes('DELETE FROM feature_usage')) {
        return {
          run: vi.fn((userId: string) => {
            mockUsageData = mockUsageData.filter((r) => r.user_id !== userId);
            return { changes: mockUsageData.length };
          }),
        };
      }
      return { get: vi.fn(), run: vi.fn() };
    }),
  })),
}));

vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

describe('UsageCounter (Local SQLite)', () => {
  const userId = 'test-user-001';
  const feature: Feature = 'collaboration';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsageData = [];
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    await usageCounter.init();
  });

  it('初始计数为 0', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    expect(usageCounter.getCount(userId, feature)).toBe(0);
  });

  it('increment 递增计数并返回新值', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    const newCount = usageCounter.increment(userId, feature);
    expect(newCount).toBe(1);
    expect(usageCounter.getCount(userId, feature)).toBe(1);
  });

  it('多次 increment 累加', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, feature);
    expect(usageCounter.getCount(userId, feature)).toBe(3);
  });

  it('不同 feature 独立计数', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, 'collaboration');
    usageCounter.increment(userId, 'collaboration');
    usageCounter.increment(userId, 'marketplace');
    expect(usageCounter.getCount(userId, 'collaboration')).toBe(2);
    expect(usageCounter.getCount(userId, 'marketplace')).toBe(1);
  });

  it('不同 userId 独立计数', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment('other-user', feature);
    expect(usageCounter.getCount(userId, feature)).toBe(1);
    expect(usageCounter.getCount('other-user', feature)).toBe(1);
  });

  it('resetForTesting 清除指定用户数据', async () => {
    const { usageCounter } = await import('@electron/services/member/usage-counter');
    usageCounter.increment(userId, feature);
    usageCounter.increment(userId, 'marketplace');
    expect(usageCounter.getCount(userId, feature)).toBe(1);

    usageCounter.resetForTesting(userId);
    expect(usageCounter.getCount(userId, feature)).toBe(0);
    expect(usageCounter.getCount(userId, 'marketplace')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/member/usage-counter.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/member/usage-counter.test.ts
git commit -m "test(usage-counter): rewrite tests for local SQLite API"
```

---

### Task 7: Rewrite TokenManager Tests

**Files:**
- Rewrite: `tests/unit/member/token-manager.test.ts`

The existing test references stale API (`setBackendBaseUrl`, `issueToken(jwt, deviceId)` with 2 params, `buildJwt` with remote token format). Must be completely rewritten for the local JWT implementation.

- [ ] **Step 1: Write the new test file**

Replace entire content of `tests/unit/member/token-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Feature, FeatureTokenPayload } from '@electron/services/member/types';

// Mock electron-store
const storeMap = new Map<string, unknown>();
vi.mock('electron-store', () => ({
  default: function MockStore() {
    return {
      get: (key: string) => storeMap.get(key),
      set: (key: string, value: unknown) => storeMap.set(key, value),
      delete: (key: string) => storeMap.delete(key),
    };
  },
}));

// Mock event-bus
vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock local-auth — simulate JWT operations
vi.mock('@electron/services/member/local-auth', () => ({
  signJwt: vi.fn((_userId: string, username: string, email: string, tier: string) =>
    `mock-jwt.${Buffer.from(JSON.stringify({ sub: _userId, username, email, tier })).toString('base64url')}.sig`,
  ),
  verifyJwt: vi.fn((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return { ...payload, iat: 1000000, exp: 9999999999 };
    } catch {
      return null;
    }
  }),
  decodeJwt: vi.fn((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return { ...payload, iat: 1000000, exp: 9999999999 };
    } catch {
      return null;
    }
  }),
}));

describe('TokenManager (Local JWT)', () => {
  let manager: any;
  let TokenManagerClass: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storeMap.clear();
    const mod = await import('@electron/services/member/token-manager');
    TokenManagerClass = mod.TokenManager;
    manager = new TokenManagerClass();
  });

  afterEach(() => {
    manager.stopAutoRenewal();
    vi.useRealTimers();
  });

  it('初始状态：无 token', () => {
    expect(manager.getToken()).toBeNull();
    expect(manager.getPayload()).toBeNull();
    expect(manager.isExpired()).toBe(true);
  });

  it('init 从 store 恢复有效 token', async () => {
    const fakeToken = 'mock-jwt.' + Buffer.from(JSON.stringify({
      sub: 'user-1', username: 'test', email: 't@t.com', tier: 'pro',
    })).toString('base64url') + '.sig';
    storeMap.set('featureToken', fakeToken);

    await manager.init();
    expect(manager.getToken()).toBe(fakeToken);
    expect(manager.getPayload()).not.toBeNull();
    expect(manager.getPayload().sub).toBe('user-1');
    expect(manager.getPayload().tier).toBe('pro');
  });

  it('init 清除过期 token', async () => {
    // decodeJwt returns exp: 9999999999 which is far in the future,
    // but we can test with a malformed token that decodeJwt returns null for
    storeMap.set('featureToken', 'invalid-token');

    const { verifyJwt } = await import('@electron/services/member/local-auth');
    (verifyJwt as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

    await manager.init();
    expect(manager.getToken()).toBeNull();
    expect(manager.getPayload()).toBeNull();
  });

  it('issueToken 生成 token 和 payload', async () => {
    const getUsage = vi.fn((f: Feature) => f === 'collaboration' ? 2 : 0);

    const token = await manager.issueToken(
      'user-1', 'testuser', 'test@example.com', 'pro', 'device-abc', getUsage,
    );

    expect(token).toBeTruthy();
    expect(manager.getToken()).toBe(token);
    expect(manager.getPayload()).not.toBeNull();
    expect(manager.getPayload().sub).toBe('user-1');
    expect(manager.getPayload().tier).toBe('pro');
    expect(manager.getPayload().deviceId).toBe('device-abc');
    expect(manager.getPayload().usage.collaboration).toEqual({ used: 2, limit: 0 });
    expect(manager.getPayload().usage.marketplace).toEqual({ used: 0, limit: 0 });
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it('issueToken for free tier has quota limit', async () => {
    const getUsage = vi.fn(() => 1);

    await manager.issueToken(
      'user-2', 'freeuser', 'free@example.com', 'free', 'device-xyz', getUsage,
    );

    const payload = manager.getPayload();
    expect(payload.tier).toBe('free');
    expect(payload.usage.collaboration.limit).toBe(3);
    expect(payload.usage.collaboration.used).toBe(1);
  });

  it('isExpired 返回 false 对有效 token', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev', () => 0,
    );
    expect(manager.isExpired()).toBe(false);
  });

  it('getUsageSnapshot 返回正确的 used/limit', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev',
      (f: Feature) => f === 'collaboration' ? 5 : 3,
    );

    expect(manager.getUsageSnapshot('collaboration' as Feature)).toEqual({ used: 5, limit: 0 });
    expect(manager.getUsageSnapshot('marketplace' as Feature)).toEqual({ used: 3, limit: 0 });
  });

  it('getUsageSnapshot 无 payload 时返回 null', () => {
    expect(manager.getUsageSnapshot('collaboration' as Feature)).toBeNull();
  });

  it('getOfflineBudget 返回 offlineBudget', async () => {
    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'dev', () => 0,
    );
    expect(manager.getOfflineBudget()).toBe(999999);
  });

  it('getOfflineBudget 无 payload 时返回 0', () => {
    expect(manager.getOfflineBudget()).toBe(0);
  });

  it('auto-renewal 24h 后触发续签', async () => {
    const getUserInfo = () => ({
      id: 'user-1', username: 'test', email: 't@t.com', tier: 'pro' as const,
    });
    const getDeviceId = () => 'device-abc';
    const getUsage = () => 0;

    await manager.issueToken(
      'user-1', 'test', 't@t.com', 'pro', 'device-abc', getUsage,
    );

    const { signJwt } = await import('@electron/services/member/local-auth');
    const callCountBefore = (signJwt as ReturnType<typeof vi.fn>).mock.calls.length;

    manager.startAutoRenewal(getUserInfo, getDeviceId, getUsage);

    // Advance 24h
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // signJwt should have been called again for renewal
    expect((signJwt as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('stopAutoRenewal 停止续签', async () => {
    const getUserInfo = () => ({
      id: 'user-1', username: 'test', email: 't@t.com', tier: 'pro' as const,
    });
    const getDeviceId = () => 'device-abc';
    const getUsage = () => 0;

    manager.startAutoRenewal(getUserInfo, getDeviceId, getUsage);
    manager.stopAutoRenewal();

    const { signJwt } = await import('@electron/services/member/local-auth');
    const callCountBefore = (signJwt as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1000);

    // No new signJwt calls should have happened
    expect((signJwt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBefore);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/member/token-manager.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/member/token-manager.test.ts
git commit -m "test(token-manager): rewrite tests for local JWT implementation"
```

---

## Execution Notes

### Dependencies between tasks
- Task 2 (auth store) → Task 3 (ActivationPage) depends on it
- Task 1 (i18n) → Tasks 3 and 4 depend on it
- Task 2 (auth store) → Task 4 (UserBadge) depends on it
- Tasks 5, 6, 7 are independent of each other and of Tasks 1-4

### Recommended execution order
1. Task 1 → Task 2 → Task 3 + Task 4 (parallel) → Task 5 → Task 6 + Task 7 (parallel)

### Out of scope (Phase 1 & 5)
- Phase 1 (验证服务部署) 是外部基础设施，不在本仓库实现
- Phase 5 (长期演进) 按需规划

### Pre-existing TypeScript errors
Files like `kernel-llm-config.ts`, `TokenTrendChart.tsx`, `ExecutionGraphCard.tsx` have pre-existing errors unrelated to this plan. Ignore them in `tsc --noEmit` output.
