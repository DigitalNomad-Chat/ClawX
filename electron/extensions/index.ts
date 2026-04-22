export { extensionRegistry } from './registry';
export { registerBuiltinExtension, loadExtensionsFromManifest } from './loader';
export type {
  Extension,
  ExtensionContext,
  HostApiRouteExtension,
  MarketplaceProviderExtension,
  MarketplaceCapability,
  AuthProviderExtension,
  AuthStatus,
  RouteHandler,
} from './types';
export {
  isHostApiRouteExtension,
  isMarketplaceProviderExtension,
  isAuthProviderExtension,
} from './types';

/**
 * ClawX Independent Kernel Extensions
 * Additional registration for standalone kernel mode extensions.
 */
import { KernelLauncher } from './kernel/kernel-launcher.js';
import { registerMarketplaceRoutes } from './marketplace/marketplace-api.js';

let kernelLauncher: KernelLauncher | null = null;

/**
 * Register all independent kernel extensions. Called during Main Process startup.
 */
export function registerExtensions(): void {
  console.log('[Extensions] Registering ClawX Independent Kernel extensions...');

  kernelLauncher = new KernelLauncher({
    onConnect: () => {
      console.log('[Extensions] Kernel connected');
    },
    onDisconnect: () => {
      console.log('[Extensions] Kernel disconnected');
    },
    onEvent: (event) => {
      if (event.type === 'error') {
        console.error('[Extensions] Kernel error:', (event as Record<string, unknown>).message);
      }
    },
  });

  registerMarketplaceRoutes();

  console.log('[Extensions] Extensions registered');
}

/**
 * Get the kernel launcher instance (for IPC handlers)
 */
export function getKernelLauncher(): KernelLauncher | null {
  return kernelLauncher;
}

/**
 * Gracefully shutdown all extensions
 */
export async function shutdownExtensions(): Promise<void> {
  console.log('[Extensions] Shutting down extensions...');
  if (kernelLauncher) {
    await kernelLauncher.stop();
    kernelLauncher = null;
  }
}
