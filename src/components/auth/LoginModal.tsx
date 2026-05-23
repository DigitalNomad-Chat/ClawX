/**
 * LoginModal - 登录/注册弹窗
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
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth';
import { Loader2, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { t } = useTranslation('auth');
  const auth = useAuthStore();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('loginModal.error.emptyFields') || '请填写用户名和密码');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await auth.login(username, password);
      if (result?.success) {
        handleClose();
      } else {
        setError(result?.reason || t('loginModal.error.loginFailed') || '登录失败');
      }
    } catch (err: any) {
      setError(err?.message || t('loginModal.error.networkError') || '网络错误');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError(t('loginModal.error.emptyFields') || '请填写所有字段');
      return;
    }
    if (password.length < 6) {
      setError(t('loginModal.error.passwordTooShort') || '密码至少6位');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await auth.register(username, email, password);
      if (result?.success) {
        handleClose();
      } else {
        setError(result?.reason || t('loginModal.error.registerFailed') || '注册失败');
      }
    } catch (err: any) {
      setError(err?.message || t('loginModal.error.networkError') || '网络错误');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('loginModal.title') || '欢迎'}</SheetTitle>
          <SheetDescription>
            {t('loginModal.description') || '登录或注册以使用完整功能'}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as 'login' | 'register');
            setError(null);
          }}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">
              {t('loginModal.loginTab') || '登录'}
            </TabsTrigger>
            <TabsTrigger value="register">
              {t('loginModal.registerTab') || '注册'}
            </TabsTrigger>
          </TabsList>

          {/* 登录表单 */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-username">
                  {t('loginModal.username') || '用户名'}
                </Label>
                <Input
                  id="login-username"
                  type="text"
                  placeholder={t('loginModal.usernamePlaceholder') || '请输入用户名'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">
                  {t('loginModal.password') || '密码'}
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder={t('loginModal.passwordPlaceholder') || '请输入密码'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || auth.isLoading}
              >
                {(isSubmitting || auth.isLoading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('loginModal.loginButton') || '登录'}
              </Button>
            </form>
          </TabsContent>

          {/* 注册表单 */}
          <TabsContent value="register">
            <form onSubmit={handleRegister} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-username">
                  {t('loginModal.username') || '用户名'}
                </Label>
                <Input
                  id="register-username"
                  type="text"
                  placeholder={t('loginModal.usernamePlaceholder') || '请输入用户名'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">
                  {t('loginModal.email') || '邮箱'}
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder={t('loginModal.emailPlaceholder') || '请输入邮箱'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">
                  {t('loginModal.password') || '密码'}
                </Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder={t('loginModal.passwordPlaceholder') || '请输入密码（至少6位）'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || auth.isLoading}
              >
                {(isSubmitting || auth.isLoading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('loginModal.registerButton') || '注册'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
