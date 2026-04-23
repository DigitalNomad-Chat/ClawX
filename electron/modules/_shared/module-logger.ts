"use strict";

/**
 * Lightweight namespaced logger for feature modules.
 * Delegates to the core logger when available, falls back to console.
 */
import { logger as coreLogger } from '../../utils/logger';

export function createModuleLogger(moduleId: string) {
  const prefix = `[${moduleId}]`;

  return {
    debug: (...args: unknown[]) => coreLogger.debug(prefix, ...args),
    info: (...args: unknown[]) => coreLogger.info(prefix, ...args),
    warn: (...args: unknown[]) => coreLogger.warn(prefix, ...args),
    error: (...args: unknown[]) => coreLogger.error(prefix, ...args),
  };
}

/** Fallback console-based logger (used in tests or early bootstrap) */
export function createConsoleModuleLogger(moduleId: string) {
  const prefix = `[${moduleId}]`;
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
