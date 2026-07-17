/**
 * Providers Host API (P3c medium-risk, read-focused).
 * Does NOT expose getApiKey via host:invoke — credentials stay on legacy secure channels.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getProviderService } from './providers/provider-service';
import { isRecord } from './payload-utils';

export function createProvidersApi(): NonNullable<CompleteHostServiceRegistry['providers']> {
  const providerService = getProviderService();
  return {
    list: async () => await providerService.listLegacyProvidersWithKeyInfo(),
    listAccounts: async () => await providerService.listAccounts(),
    listVendors: async () => await providerService.listVendors(),
    hasApiKey: async (payload?: unknown) => {
      const providerId = typeof payload === 'string'
        ? payload
        : isRecord(payload) && typeof payload.providerId === 'string'
          ? payload.providerId
          : undefined;
      if (!providerId?.trim()) {
        throw new Error('providerId is required');
      }
      return await providerService.hasLegacyProviderApiKey(providerId.trim());
    },
  };
}
