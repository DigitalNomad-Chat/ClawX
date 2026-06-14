/**
 * Activation Page
 * Allows logged-in users to activate a License Key to upgrade their tier.
 * Replaces the old native C++ licenseAPI with auth:activate IPC.
 */
import { useState, useRef, useEffect } from 'react';
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
        timerRef.current = setTimeout(() => navigate('/'), 1500);
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
