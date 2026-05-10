/**
 * Module Extension System — Shared Types
 * All module metadata and registration types live here.
 */
import type { ReactElement, ReactNode } from 'react';

/** Registration record for a sidebar navigation item */
export interface ModuleNavItem {
  /** Router path (e.g. /dashboard) */
  to: string;
  /** Lucide icon component */
  icon: ReactNode;
  /** Display label (will be passed through t() if it contains a ns:key pattern) */
  label: string;
  /** Optional badge text */
  badge?: string;
  /** i18n namespace:key for translation, or plain string */
  i18nKey?: string;
  /** Playwright test id */
  testId?: string;
  /** Optional sort order (lower = higher in the list). Default 100. */
  order?: number;
}

/** Front-end module manifest */
export interface FrontendModule {
  /** Unique kebab-case id */
  id: string;
  /** Human readable name */
  name: string;
  /** Pre-built <Route /> JSX elements */
  routes: ReactElement[];
  /** Sidebar nav items contributed by this module */
  navItems: ModuleNavItem[];
  /** i18n namespace names this module adds */
  i18nNamespaces?: string[];
  /** Whether the module is enabled by default */
  enabledByDefault?: boolean;
}

/** Lazy-loaded module placeholder (used before the real module is imported) */
export interface LazyModule {
  id: string;
  /** Dynamic import factory */
  loader: () => Promise<{ default: FrontendModule }>;
}
