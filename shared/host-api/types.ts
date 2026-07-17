/**
 * v0.4.9 P0 — Host request/response envelope types (scaffold).
 * Aligned with upstream 581981f2 shared/host-api/types.ts shape.
 * Not wired to ipcMain/preload in P0.
 */
import type {
  HostApiAction,
  HostApiModule,
  HostApiPayload,
} from './contract';

export type HostRequest = {
  id: string;
  module: string;
  action: string;
  payload?: unknown;
};

export type TypedHostRequest<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = {
  id: string;
  module: M;
  action: A;
  payload?: HostApiPayload<M, A>;
};

export type HostResponse<T = unknown> =
  | { id?: string; ok: true; data: T }
  | {
    id?: string;
    ok: false;
    error?: { code?: string; message?: string; details?: unknown };
  };
