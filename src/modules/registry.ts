/**
 * Module Extension System — Front-end Registry
 *
 * This file is the single source of truth for all front-end feature modules.
 * Core files (App.tsx / Sidebar.tsx) import ONLY from here so upstream
 * merges never need to touch individual module directories.
 *
 * To register a new module:
 *   1. Create src/modules/<module-name>/index.ts exporting a FrontendModule
 *   2. Add it to the `modules` array below.
 */
import type { ReactElement } from 'react';
import type { ModuleNavItem, FrontendModule } from './types';

// ---------------------------------------------------------------------------
//  Module imports — add new modules here
// ---------------------------------------------------------------------------
//  Each module is implemented as a self-contained directory under
//  src/modules/<name>/ and exports a FrontendModule object.
//  Every module directory MUST contain an index.ts even if it exports
//  an empty module, so the registry always compiles.
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

const allModules: FrontendModule[] = [
  dashboardModule,
  collaborationModule,
  tasksModule,
  agentBoardModule,
  documentsModule,
  memoryPlusModule,
  taskRoomsModule,
];

/** All registered module routes as pre-built JSX elements */
export const moduleRoutes: ReactElement[] = allModules.flatMap((m) => m.routes);

/** All registered sidebar nav items, sorted by order ascending */
export const moduleNavItems: ModuleNavItem[] = allModules
  .flatMap((m) => m.navItems.map((n) => ({ ...n, order: n.order ?? 100 })))
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

/** i18n namespaces contributed by modules */
export const moduleI18nNamespaces: string[] = Array.from(
  new Set(allModules.flatMap((m) => m.i18nNamespaces ?? []))
);

/** List of module ids that are enabled by default */
export const defaultEnabledModules: string[] = allModules
  .filter((m) => m.enabledByDefault !== false)
  .map((m) => m.id);

/** Debug helper: list all registered modules */
export function listRegisteredModules(): Array<{ id: string; name: string; routes: number; navItems: number }> {
  return allModules.map((m) => ({
    id: m.id,
    name: m.name,
    routes: m.routes.length,
    navItems: m.navItems.length,
  }));
}
