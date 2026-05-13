import React, { useState, useEffect } from 'react';

interface WindowWithLicenseAPI extends Window {
  licenseAPI?: {
    getMachineCode: () => Promise<string>;
    getMachineFactors: () => Promise<Record<string, string>>;
    activate: (code: string) => Promise<{ success: boolean; reason?: string }>;
    onMachineCode: (callback: (code: string) => void) => () => void;
  };
}

const ActivationPage: React.FC = () => {
  const [machineCode, setMachineCode] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const win = window as unknown as WindowWithLicenseAPI;

    if (win.licenseAPI) {
      win.licenseAPI.getMachineCode().then(setMachineCode);
      const unsubscribe = win.licenseAPI.onMachineCode(setMachineCode);
      return () => {
        unsubscribe();
      };
    }
  }, []);

  const handleActivate = async () => {
    if (!licenseCode.trim()) {
      setError('请输入授权码');
      return;
    }

    setLoading(true);
    setError('');

    const win = window as unknown as WindowWithLicenseAPI;
    if (!win.licenseAPI) {
      setError('授权模块未加载');
      setLoading(false);
      return;
    }

    try {
      const result = await win.licenseAPI.activate(licenseCode.trim());
      if (result.success) {
        window.location.href = '/';
      } else {
        setError(getErrorMessage(result.reason));
      }
    } catch (err) {
      setError('验证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (reason?: string) => {
    switch (reason) {
      case 'INVALID_LICENSE':
        return '授权码无效或已过期';
      case 'MACHINE_MISMATCH':
        return '授权码与当前设备不匹配';
      case 'VERIFICATION_ERROR':
        return '验证过程出错，请联系技术支持';
      default:
        return '验证失败，请检查授权码';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(machineCode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">ClawX 激活</h1>
          <p className="text-gray-400">请输入您的授权码以激活 ClawX</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm text-gray-400 mb-2">您的机器码</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-sm font-mono text-green-400">
              {machineCode || '加载中...'}
            </code>
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
            >
              复制
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            请将机器码发送给管理员获取授权码
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm text-gray-400 mb-2">授权码</label>
          <textarea
            value={licenseCode}
            onChange={(e) => setLicenseCode(e.target.value)}
            placeholder="粘贴授权码（约110字符）..."
            className="w-full bg-gray-900 rounded px-3 py-2 text-sm font-mono text-white placeholder-gray-600 resize-none h-24"
          />
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleActivate}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg font-medium transition"
        >
          {loading ? '验证中...' : '激活'}
        </button>
      </div>
    </div>
  );
};

export default ActivationPage;
