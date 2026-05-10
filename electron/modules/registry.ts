/**
 * Module Extension System — Back-end Registry
 *
 * This file is the single source of truth for all back-end feature modules.
 * Core files (server.ts / ipc-handlers.ts / main/index.ts) import ONLY from
 * here so upstream merges never need to touch individual module directories.
 *
 * To register a new module:
 *   1. Create electron/modules/<module-name>/index.ts exporting a BackendModule
 *   2. Add it to the `modules` array below.
 */
import type { ModuleRouteHandler, BackendModule } from './types';
import type { HostApiContext } from '../api/context';

// ---------------------------------------------------------------------------
//  Module imports — add new modules here
// ---------------------------------------------------------------------------

import dashboardModule from './dashboard';
import collaborationModule from './collaboration';
import tasksModule from './tasks';
import agentBoardModule from './agent-board';
import documentsModule from './documents';
import memoryPlusModule from './memory-plus';
import taskRoomsModule from './task-rooms';

// ---------------------------------------------------------------------------
//  Registry assembly
// ---------------------------------------------------------------------------

const allModules: BackendModule[] = [
  dashboardModule,
  collaborationModule,
  tasksModule,
  agentBoardModule,
  documentsModule,
  memoryPlusModule,
  taskRoomsModule,
];

/** Flattened route handlers for injection into Host API server */
export const moduleRouteHandlers: ModuleRouteHandler[] = allModules.flatMap(
  (m) => m.routeHandlers
);

/** Register all module IPC handlers */
export async function registerModuleIpcHandlers(): Promise<void> {
  for (const m of allModules) {
    if (m.registerIpc) {
      try {
        await m.registerIpc();
      } catch (error) {
         
        console.error(`[Module Registry] IPC registration failed for "${m.id}":`, error);
      }
    }
  }
}

/** Initialize all modules at startup */
export async function initModules(ctx: HostApiContext): Promise<void> {
  for (const m of allModules) {
    if (m.init) {
      try {
        await m.init(ctx);
      } catch (error) {
         
        console.error(`[Module Registry] Init failed for "${m.id}":`, error);
      }
    }
  }
}

/** Shutdown all modules during app quit */
export async function shutdownModules(): Promise<void> {
  for (const m of allModules) {
    if (m.shutdown) {
      try {
        await m.shutdown();
      } catch (error) {
         
        console.error(`[Module Registry] Shutdown failed for "${m.id}":`, error);
      }
    }
  }
}

/** Debug helper: list all registered back-end modules */
export function listRegisteredModules(): Array<{ id: string; name: string; handlers: number }> {
  return allModules.map((m) => ({
    id: m.id,
    name: m.name,
    handlers: m.routeHandlers.length,
  }));
}
