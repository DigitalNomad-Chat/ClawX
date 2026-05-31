import { ipcMain } from 'electron';
import { MemberModule } from '../../services/member';
import { Feature } from '../../services/member/types';
import { logger } from '../../utils/logger';

/**
 * Register auth/member IPC handlers (Cloud-First).
 *
 * Channels:
 *   auth:login        -> { username, password }
 *   auth:register     -> { username, email, password }
 *   auth:logout       -> void
 *   auth:getUser      -> MemberState
 *   auth:checkFeature -> { feature: Feature }
 *   auth:recordUsage  -> { feature: Feature }
 *   auth:getUsageStats-> { feature?: Feature }
 *   auth:activate     -> { licenseKey: string }
 */
export function registerAuthIpcHandlers(memberModule: MemberModule): void {
  ipcMain.handle('auth:login', async (_, credentials: { username: string; password: string }) => {
    try {
      const result = await memberModule.client.login(
        credentials.username,
        credentials.password,
        memberModule.deviceId ?? undefined,
      );
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:login] error:', err);
      return { success: false, reason: err.message || 'Login failed' };
    }
  });

  ipcMain.handle('auth:register', async (_, credentials: { username: string; email: string; password: string }) => {
    try {
      const result = await memberModule.client.register(
        credentials.username,
        credentials.email,
        credentials.password,
        memberModule.deviceId ?? undefined,
      );
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:register] error:', err);
      return { success: false, reason: err.message || 'Registration failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await memberModule.client.logout();
      return { success: true };
    } catch (err: any) {
      logger.error('[IPC auth:logout] error:', err);
      return { success: false, reason: err.message || 'Logout failed' };
    }
  });

  ipcMain.handle('auth:getUser', async () => {
    // Always fetch fresh user data from the cloud
    const user = await memberModule.client.getMe();
    return user ?? memberModule.state.userInfo ?? null;
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

  ipcMain.handle('auth:recordUsage', async (_, feature: Feature) => {
    try {
      await memberModule.recordUsage(feature);
      return { success: true };
    } catch (err: any) {
      logger.error('[IPC auth:recordUsage] error:', err);
      return { success: false, reason: err.message || 'Record failed' };
    }
  });

  ipcMain.handle('auth:getUsageStats', async (_, _feature?: Feature) => {
    try {
      const stats = await memberModule.client.getUsageStats();
      return stats;
    } catch (err: any) {
      logger.error('[IPC auth:getUsageStats] error:', err);
      return [];
    }
  });

  ipcMain.handle('auth:activate', async (_, { licenseKey }: { licenseKey: string }) => {
    try {
      const result = await memberModule.client.activateLicense(
        licenseKey,
        memberModule.deviceId ?? 'unknown',
      );
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:activate] error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  });

  logger.info('[IPC] Auth handlers registered (cloud-first)');
}
