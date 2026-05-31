import { MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { resolveApiBaseUrl } from '../../config/server';

/** Health endpoint to probe */
const HEALTH_ENDPOINT = '/health';

/** Probe timeout in milliseconds */
const PROBE_TIMEOUT_MS = 5_000;

/** Base interval when online (ms) */
const BASE_INTERVAL_MS = 5_000;

/** Maximum backoff interval when offline (ms) — 5 minutes */
const MAX_INTERVAL_MS = 5 * 60_000;

/** Backoff multiplier applied on each consecutive offline check */
const BACKOFF_MULTIPLIER = 2;

/** Backend base URL — injectable for tests */
let _backendBaseUrl = resolveApiBaseUrl();

export function setBackendBaseUrl(url: string): void {
  _backendBaseUrl = url;
}

export class NetworkDetector {
  private _isOnline = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _currentInterval = BASE_INTERVAL_MS;
  private _running = false;

  /** Current online status */
  get isOnline(): boolean {
    return this._isOnline;
  }

  /** Start periodic probing */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._scheduleNext();
  }

  /** Stop periodic probing */
  stop(): void {
    this._running = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** Perform a single connectivity check */
  async checkOnce(): Promise<boolean> {
    const online = await this._probe();
    this._applyStatus(online);
    return online;
  }

  // ---- internal helpers ----

  private _scheduleNext(): void {
    if (!this._running) return;

    this._timer = setTimeout(async () => {
      await this.checkOnce();
      this._scheduleNext();
    }, this._currentInterval);

    // Allow the Node.js process to exit naturally when only this timer remains
    if (this._timer && typeof this._timer === 'object' && 'unref' in this._timer) {
      (this._timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  private async _probe(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const url = `${_backendBaseUrl}${HEALTH_ENDPOINT}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private _applyStatus(online: boolean): void {
    const previous = this._isOnline;
    this._isOnline = online;

    if (online) {
      // Reset backoff when back online
      this._currentInterval = BASE_INTERVAL_MS;

      // Transition: offline -> online
      if (!previous) {
        memberEventBus.emit(MemberEvent.NETWORK_ONLINE);
      }
    } else {
      // Transition: online -> offline
      if (previous) {
        memberEventBus.emit(MemberEvent.NETWORK_OFFLINE);
      }

      // Exponential backoff while offline
      this._currentInterval = Math.min(
        this._currentInterval * BACKOFF_MULTIPLIER,
        MAX_INTERVAL_MS,
      );
    }
  }
}

/** Singleton instance */
export const networkDetector = new NetworkDetector();
