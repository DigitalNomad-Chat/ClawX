/**
 * ClawX License Verification Server
 * Cloudflare Workers entry point
 */
import { Router } from 'itty-router';
import type { Env } from './types';
import { corsPreflightResponse, errorResponse } from './utils/response';
import { handleActivate } from './handlers/activate';
import { handleVerify } from './handlers/verify';
import { handleCreateLicense, handleListLicenses, handleRevokeLicense } from './handlers/admin';
import { handleRegister, handleLogin, handleLogout, handleMe } from './handlers/auth';
import { handleUsageCheck, handleUsageRecord, handleUsageStats } from './handlers/usage';
import { handleAdminListUsers, handleAdminGetUser, handleAdminUpdateUser } from './handlers/admin-users';
import { handleAdminListTiers, handleAdminUpdateTier } from './handlers/admin-tiers';
import { handleAdminStats } from './handlers/admin-stats';

const router = Router<Request, [Env]>();

// CORS preflight
router.options('*', () => corsPreflightResponse());

// Health check
router.get('/v1/health', () => new Response('OK', { status: 200 }));

// Public endpoints (called by ClawX client)
router.post('/v1/license/activate', async (request, env) => handleActivate(request, env));
router.post('/v1/license/verify', async (request, env) => handleVerify(request, env));

// Auth endpoints
router.post('/v1/auth/register', async (request, env) => handleRegister(request, env));
router.post('/v1/auth/login', async (request, env) => handleLogin(request, env));
router.post('/v1/auth/logout', async (request, env) => handleLogout(request, env));
router.get('/v1/auth/me', async (request, env) => handleMe(request, env));

// Usage endpoints
router.get('/v1/usage/check', async (request, env) => handleUsageCheck(request, env));
router.post('/v1/usage/record', async (request, env) => handleUsageRecord(request, env));
router.get('/v1/usage/stats', async (request, env) => handleUsageStats(request, env));

// Admin endpoints (require API key)
router.post('/v1/admin/licenses', async (request, env) => handleCreateLicense(request, env));
router.get('/v1/admin/licenses', async (request, env) => handleListLicenses(request, env));
router.delete('/v1/admin/licenses/:key', async (request, env) => {
  const url = new URL(request.url);
  const key = url.pathname.split('/').pop() ?? '';
  return handleRevokeLicense(request, env, key);
});

router.get('/v1/admin/users', async (request, env) => handleAdminListUsers(request, env));
router.get('/v1/admin/users/:id', async (request, env) => handleAdminGetUser(request, env));
router.patch('/v1/admin/users/:id', async (request, env) => handleAdminUpdateUser(request, env));

router.get('/v1/admin/tiers', async (request, env) => handleAdminListTiers(request, env));
router.patch('/v1/admin/tiers/:tier', async (request, env) => handleAdminUpdateTier(request, env));

router.get('/v1/admin/stats', async (request, env) => handleAdminStats(request, env));

// 404 fallback
router.all('*', () => errorResponse('Not Found', 404));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env);
  },
};
