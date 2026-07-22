/**
 * Gateway RPC method compatibility mapping for OpenClaw 2026.6.6.
 *
 * This module is the single source of truth for legacy method names used by
 * `GatewayClient` (electron/gateway/client.ts). It maps each legacy name to
 * the real method advertised by Gateway 2026.6.6, or to `null` when the legacy
 * capability was removed/renamed with an incompatible parameter/response shape.
 *
 * Rules:
 * - A method is mapped ONLY when the 2026.6.6 equivalent has the same intent
 *   AND a compatible parameter shape.
 * - A method is explicitly marked unsupported (`null`) when no equivalent
 *   exists or when the shape changed enough that a silent rename would hide
 *   a breakage.
 * - `GatewayClient` must call `resolveGatewayClientMethod` before every RPC;
 *   unsupported methods throw a typed error instead of failing silently on the
 *   wire with METHOD_NOT_FOUND.
 */

/**
 * Error thrown when a legacy GatewayClient method has no compatible mapping
 * to OpenClaw 2026.6.6 RPC methods.
 */
export class UnsupportedGatewayMethodError extends Error {
  readonly code = 'UNSUPPORTED_GATEWAY_METHOD' as const;

  constructor(
    readonly method: string,
    message?: string,
  ) {
    super(
      message
        ? `Unsupported Gateway RPC method "${method}": ${message}`
        : `Unsupported Gateway RPC method "${method}" (removed or incompatible in OpenClaw 2026.6.6)`,
    );
    this.name = 'UnsupportedGatewayMethodError';
  }
}

/**
 * Legacy method name -> current OpenClaw 2026.6.6 method name, or `null` if
 * the legacy method is unsupported.
 */
export const GATEWAY_CLIENT_LEGACY_TO_METHOD_MAP: Record<string, string | null> = {
  // chat: stable
  'chat.send': 'chat.send',
  'chat.history': 'chat.history',
  'chat.clear': null, // no equivalent advertised method in 2026.6.6

  // cron: list is stable; write/delete/run shapes changed, mark unsupported
  'cron.list': 'cron.list',
  'cron.create': null, // renamed to cron.add with a different payload shape
  'cron.update': null, // real shape is { id, patch }
  'cron.delete': null, // renamed to cron.remove with { id } instead of { taskId }
  'cron.run': null, // real shape is { id, mode? } instead of { taskId }

  // system: health/config renamed; updateConfig/version removed
  'system.health': 'health',
  'system.config': 'config.get',
  'system.updateConfig': null, // config.patch requires a patch envelope
  'system.version': null, // no equivalent advertised method

  // providers: renamed to models, but response shape is different; keep mapping
  // because the intent is the same and there are no parameters.
  'providers.list': 'models.list',
  'providers.set': null,
  'providers.remove': null,
  'providers.test': null,

  // channels: the 2026.6.6 surface is status/start/stop/logout with different
  // identifiers and shapes; do not silently map the old CRUD methods.
  'channels.list': null,
  'channels.get': null,
  'channels.connect': null,
  'channels.disconnect': null,
  'channels.getQRCode': null,

  // skills: 2026.6.6 exposes a different skill-management surface; none of the
  // old methods are directly compatible.
  'skills.list': null,
  'skills.enable': null,
  'skills.disable': null,
  'skills.getConfig': null,
  'skills.updateConfig': null,
  'skills.bundles': null,
  'skills.installBundle': null,
};

/**
 * Resolve a legacy GatewayClient method name to the real OpenClaw 2026.6.6
 * RPC method name.
 *
 * @throws {UnsupportedGatewayMethodError} when the legacy method was removed or
 *   is incompatible with the current Gateway API.
 */
export function resolveGatewayClientMethod(legacyMethod: string): string {
  const mapped = GATEWAY_CLIENT_LEGACY_TO_METHOD_MAP[legacyMethod];
  if (mapped === null) {
    throw new UnsupportedGatewayMethodError(legacyMethod);
  }
  if (typeof mapped === 'string') {
    return mapped;
  }
  throw new UnsupportedGatewayMethodError(legacyMethod, 'not mapped');
}
