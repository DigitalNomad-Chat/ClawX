/**
 * Auth State Store
 * Manages authentication and user state
 */
import { create } from 'zustand';
import { invokeIpc } from '@/lib/api-client';
import type { Tier, UserInfo, UsageInfo } from '@/types/auth';

export interface LoginResult {
  success: boolean;
  reason?: string;
}

export interface RegisterResult {
  success: boolean;
  reason?: string;
}

export interface ActivateResult {
  success: boolean;
  reason?: string;
}

interface AuthState {
  isLoggedIn: boolean;
  isGuest: boolean;
  userInfo: UserInfo | null;
  tier: Tier | null;
  usageStats: UsageInfo[] | null;
  isOnline: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<LoginResult>;
  register: (username: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkFeature: (feature: string) => Promise<UsageInfo>;
  recordUsage: (feature: string, triggerAction?: string) => Promise<void>;
  activateLicense: (licenseKey: string) => Promise<ActivateResult>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  isGuest: false,
  userInfo: null,
  tier: null,
  usageStats: null,
  isOnline: true,
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const result = await invokeIpc<{ user?: UserInfo; token?: string; success?: boolean; reason?: string }>('auth:login', { username, password });
      if (result?.success && result?.user) {
        set({
          isLoggedIn: true,
          isGuest: false,
          userInfo: result.user,
          tier: result.user.subscriptionTier,
        });
        return { success: true };
      }
      return { success: false, reason: result?.reason || 'Login failed' };
    } catch (err: any) {
      const isNetwork = err?.message?.includes('network') || err?.message?.includes('fetch') || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('timeout');
      return { success: false, reason: isNetwork ? '服务器不可用，请检查网络连接' : (err?.message || 'Network error') };
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true });
    try {
      const result = await invokeIpc<{ user?: UserInfo; token?: string; success?: boolean; reason?: string }>('auth:register', { username, email, password });
      if (result?.success && result?.user) {
        set({
          isLoggedIn: true,
          isGuest: false,
          userInfo: result.user,
          tier: result.user.subscriptionTier,
        });
        return { success: true };
      }
      return { success: false, reason: result?.reason || 'Registration failed' };
    } catch (err: any) {
      const isNetwork = err?.message?.includes('network') || err?.message?.includes('fetch') || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('timeout');
      return { success: false, reason: isNetwork ? '服务器不可用，请检查网络连接' : (err?.message || 'Network error') };
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await invokeIpc('auth:logout');
      set({
        isLoggedIn: false,
        isGuest: true,
        userInfo: null,
        tier: null,
        usageStats: null,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    set({ isLoading: true });
    try {
      const user = await invokeIpc<UserInfo>('auth:getUser');
      const usageStats = await invokeIpc<UsageInfo[]>('auth:getUsageStats');
      set({
        userInfo: user,
        tier: user?.subscriptionTier ?? null,
        usageStats,
        isLoggedIn: !!user,
        isGuest: !user,
      });
    } catch {
      // Silently fail on network errors
      set({ isGuest: true, isLoggedIn: false });
    } finally {
      set({ isLoading: false });
    }
  },

  checkFeature: async (feature) => {
    try {
      return await invokeIpc<UsageInfo>('auth:checkFeature', { feature });
    } catch {
      // Return a default denied response on network failure
      return { feature, used: 0, limit: 0, remaining: 0, tier: 'free', allowed: false } as UsageInfo;
    }
  },

  recordUsage: async (feature, triggerAction) => {
    try {
      await invokeIpc('auth:recordUsage', { feature, triggerAction });
    } catch {
      // Silently fail on network errors
    }
  },

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
}));
