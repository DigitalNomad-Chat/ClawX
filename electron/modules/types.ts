/**
 * Module Extension System — Back-end Shared Types
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostApiContext } from '../api/context';

export type ModuleRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
) => Promise<boolean>;

export interface BackendModule {
  /** Unique kebab-case id */
  id: string;
  /** Human readable name */
  name: string;
  /** HTTP route handlers for the Host API server */
  routeHandlers: ModuleRouteHandler[];
  /** IPC handlers registration function */
  registerIpc?: () => void | Promise<void>;
  /** One-time initialization hook (called at app startup) */
  init?: (ctx: HostApiContext) => void | Promise<void>;
  /** Shutdown hook (called during app quit) */
  shutdown?: () => void | Promise<void>;
  /** Whether enabled by default */
  enabledByDefault?: boolean;
}
