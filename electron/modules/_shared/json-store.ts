"use strict";

/**
 * JSON File Storage Base Class
 *
 * Inspired by Control Center's atomic write pattern:
 *   1. Write to a temp file
 *   2. fs.rename() temp → target (atomic on POSIX)
 *   3. Keep an in-memory cache with TTL
 *
 * Provides schema-version tracking for future migrations.
 */
import { readFile, writeFile, rename, access } from 'fs/promises';
import { join } from 'path';
import { createModuleLogger } from './module-logger';

const logger = createModuleLogger('json-store');

interface JsonStoreOptions<T> {
  /** Absolute path to the JSON file */
  filePath: string;
  /** Default value when file does not exist */
  defaultValue: T;
  /** Schema version (bumped when on-disk format changes) */
  schemaVersion?: number;
  /** Migration function: oldValue → newValue */
  migrate?: (oldValue: unknown, fromVersion: number) => T;
  /** Cache TTL in ms (0 = no cache) */
  cacheTtlMs?: number;
}

interface PersistedWrapper<T> {
  _schemaVersion: number;
  _updatedAt: string;
  data: T;
}

export class JsonStore<T> {
  private readonly filePath: string;
  private readonly defaultValue: T;
  private readonly schemaVersion: number;
  private readonly migrate?: (oldValue: unknown, fromVersion: number) => T;
  private readonly cacheTtlMs: number;

  private cache: { value: T; ts: number } | null = null;
  private writePromise: Promise<void> | null = null;

  constructor(opts: JsonStoreOptions<T>) {
    this.filePath = opts.filePath;
    this.defaultValue = opts.defaultValue;
    this.schemaVersion = opts.schemaVersion ?? 1;
    this.migrate = opts.migrate;
    this.cacheTtlMs = opts.cacheTtlMs ?? 5000;
  }

  // -------------------------------------------------------------------------
  //  Read
  // -------------------------------------------------------------------------

  async read(): Promise<T> {
    const now = Date.now();
    if (this.cache && now - this.cache.ts < this.cacheTtlMs) {
      return this.cache.value;
    }

    try {
      await access(this.filePath);
    } catch {
      return this.setCache(this.defaultValue);
    }

    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedWrapper<T> | T;

      let data: T;
      if (
        parsed &&
        typeof parsed === 'object' &&
        '_schemaVersion' in parsed &&
        '_updatedAt' in parsed
      ) {
        const wrapper = parsed as PersistedWrapper<T>;
        if (wrapper._schemaVersion < this.schemaVersion && this.migrate) {
          data = this.migrate(wrapper.data, wrapper._schemaVersion);
        } else {
          data = wrapper.data;
        }
      } else {
        // Legacy format without wrapper — treat as raw data at version 1
        if (this.schemaVersion > 1 && this.migrate) {
          data = this.migrate(parsed, 1);
        } else {
          data = parsed as T;
        }
      }

      return this.setCache(data);
    } catch (error) {
      logger.error('Failed to read JSON store:', this.filePath, error);
      return this.setCache(this.defaultValue);
    }
  }

  /** Synchronous read from cache only (returns default if cache miss) */
  readCached(): T {
    return this.cache?.value ?? this.defaultValue;
  }

  // -------------------------------------------------------------------------
  //  Write
  // -------------------------------------------------------------------------

  async write(value: T): Promise<void> {
    // Chain writes so parallel calls don't corrupt the file.
    const performWrite = async (): Promise<void> => {
      const wrapper: PersistedWrapper<T> = {
        _schemaVersion: this.schemaVersion,
        _updatedAt: new Date().toISOString(),
        data: value,
      };

      const tempPath = `${this.filePath}.tmp`;
      try {
        await writeFile(tempPath, JSON.stringify(wrapper, null, 2), 'utf-8');
        await rename(tempPath, this.filePath);
        this.cache = { value, ts: Date.now() };
      } catch (error) {
        logger.error('Failed to write JSON store:', this.filePath, error);
        throw error;
      }
    };

    if (this.writePromise) {
      this.writePromise = this.writePromise.then(performWrite, performWrite);
    } else {
      this.writePromise = performWrite();
    }

    await this.writePromise;
    this.writePromise = null;
  }

  // -------------------------------------------------------------------------
  //  Update
  // -------------------------------------------------------------------------

  async update(updater: (current: T) => T): Promise<T> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private setCache(value: T): T {
    this.cache = { value, ts: Date.now() };
    return value;
  }

  /** Invalidate in-memory cache (forces next read from disk) */
  invalidateCache(): void {
    this.cache = null;
  }
}

/** Factory: create a JsonStore scoped to a module's runtime directory */
export function createModuleJsonStore<T>(
  moduleId: string,
  fileName: string,
  defaultValue: T,
  opts?: Omit<JsonStoreOptions<T>, 'filePath' | 'defaultValue'>
): JsonStore<T> {
  const { getModuleFilePath } = require('./runtime-path');
  return new JsonStore<T>({
    filePath: getModuleFilePath(moduleId, fileName),
    defaultValue,
    ...opts,
  });
}
