import { ipcMain } from 'electron';
import { MemberModule } from '../../services/member';
import { Feature } from '../../services/member/types';
import { logger } from '../../utils/logger';

/**
 * Register auth/member IPC handlers.
 *
 * Channels:
 *   auth:login        -> { username, password }
 *   auth:register     -> { username, email, password }
 *   auth:logout       -> void
 *   auth:getUser      -> MemberState
 *   auth:checkFeature -> { feature: Feature }
 *   auth:recordUsage  -> { feature: Feature }
 *   auth:getUsageStats-> { feature?: Feature }
 */
export function registerAuthIpcHandlers(memberModule: MemberModule): void {
  ipcMain.handle('auth:login', async (_, credentials: { username: string; password: string }) => {
    try {
      const result = await memberModule.manager.login({
        ...credentials,
        deviceId: memberModule.deviceId ?? undefined,
        deviceName: undefined,
      });
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:login] error:', err);
      return { success: false, reason: err.message || 'Login failed' };
    }
  });

  ipcMain.handle('auth:register', async (_, credentials: { username: string; email: string; password: string }) => {
    try {
      const result = await memberModule.manager.register({
        ...credentials,
        deviceId: memberModule.deviceId ?? undefined,
      });
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:register] error:', err);
      return { success: false, reason: err.message || 'Registration failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await memberModule.manager.logout();
      return { success: true };
    } catch (err: any) {
      logger.error('[IPC auth:logout] error:', err);
      return { success: false, reason: err.message || 'Logout failed' };
    }
  });

  ipcMain.handle('auth:getUser', () => {
    return memberModule.state.userInfo ?? null;
  });

  ipcMain.handle('auth:checkFeature', async (_, feature: Feature) => {
    try {
      const info = await memberModule.checkFeature(feature);
      return info;
    } catch (err: any) {
      logger.error('[IPC auth:checkFeature] error:', err);
      return null;
    }
  });

  ipcMain.handle('auth:recordUsage', (_, feature: Feature) => {
    try {
      memberModule.recordUsage(feature);
      return { success: true };
    } catch (err: any) {
      logger.error('[IPC auth:recordUsage] error:', err);
      return { success: false, reason: err.message || 'Record failed' };
    }
  });

  ipcMain.handle('auth:getUsageStats', (_, feature?: Feature) => {
    try {
      const payload = memberModule.token.getPayload();
      if (!payload) {
        return [];
      }

      const features = feature
        ? { [feature]: payload.usage[feature] }
        : payload.usage;

      const result: { feature: Feature; used: number; limit: number; remaining: number; tier: string; allowed?: boolean }[] = [];
      for (const [feat, data] of Object.entries(features)) {
        if (data) {
          const localCount = memberModule.usage.getCount(feat as Feature);
          result.push({
            feature: feat as Feature,
            used: data.used + localCount,
            limit: data.limit,
            remaining: Math.max(0, data.limit - data.used - localCount),
            tier: payload.tier,
          });
        }
      }

      return result;
    } catch (err: any) {
      logger.error('[IPC auth:getUsageStats] error:', err);
      return [];
    }
  });

  ipcMain.handle('auth:activate', async (_, { licenseKey, userId }: { licenseKey: string; userId: string }) => {
    try {
      const { activationService } = await import('../../services/member/activation');
      const result = await activationService.activate(userId, licenseKey, memberModule.deviceId ?? 'unknown');
      if (result.success) {
        await memberModule.manager.refreshUser();
      }
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:activate] error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  });

  logger.info('[IPC] Auth handlers registered');
}
