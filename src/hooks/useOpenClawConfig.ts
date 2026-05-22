/**
 * Hook for managing OpenClaw configuration via Host API.
 * Reads and writes ~/.openclaw/openclaw.json.
 */
import { useState, useCallback } from 'react';
import { hostApiFetch } from '@/lib/host-api';
import type { ConfigSource, OpenClawConfig } from '@/pages/AdvancedConfig/types';

interface UseOpenClawConfigReturn {
  loading: boolean;
  saving: boolean;
  error: string | null;
  configSource: ConfigSource | null;
  loadConfig: () => Promise<void>;
  saveConfig: (config: OpenClawConfig) => Promise<void>;
}

export function useOpenClawConfig(): UseOpenClawConfigReturn {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configSource, setConfigSource] = useState<ConfigSource | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await hostApiFetch<{
        success: boolean;
        config: OpenClawConfig;
        fileInfo: { path: string; modifiedAt?: string; size?: number };
        error?: string;
      }>('/api/config');
      if (!result.success) {
        throw new Error(result.error || 'Failed to load config');
      }
      setConfigSource({ config: result.config, fileInfo: result.fileInfo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setConfigSource(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (config: OpenClawConfig) => {
    setSaving(true);
    setError(null);
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save config');
      }
      // Update local state with saved config
      setConfigSource((prev) =>
        prev ? { config, fileInfo: prev.fileInfo } : null,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { loading, saving, error, configSource, loadConfig, saveConfig };
}
