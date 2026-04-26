// ── Main branch Extension framework re-exports ──
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

// ── Kernel branch: Independent Kernel extensions ──
import { KernelLauncher } from './kernel/kernel-launcher.js';
import { registerMarketplaceRoutes } from './marketplace/marketplace-api.js';

let kernelLauncher: KernelLauncher | null = null;

/**
 * Register all kernel-mode extensions. Called once during Main Process startup.
 */
export function registerExtensions(): void {
  console.log('[Extensions] Registering ClawX Independent Kernel extensions...');

  // Initialize kernel launcher with event forwarding
  kernelLauncher = new KernelLauncher({
    onConnect: () => {
      console.log('[Extensions] Kernel connected');
    },
    onDisconnect: () => {
      console.log('[Extensions] Kernel disconnected');
    },
    onEvent: (event) => {
      // Global event handler - can be used for logging, monitoring, etc.
      if (event.type === 'error') {
        console.error('[Extensions] Kernel error:', (event as Record<string, unknown>).message);
      }
    },
  });

  // Register marketplace API routes
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
 * Gracefully shutdown all kernel extensions
 */
export async function shutdownExtensions(): Promise<void> {
  console.log('[Extensions] Shutting down extensions...');
  if (kernelLauncher) {
    await kernelLauncher.stop();
    kernelLauncher = null;
  }
}
