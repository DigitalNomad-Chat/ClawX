/**
 * v0.4.9 P2 — Main-side host request/response types + registry typing.
 * Selective adapter from upstream 581981f2; imports shared HostApiContract via @shared.
 */
import type { HostApiContract } from '@shared/host-api/contract';

export type HostRequest = {
  id: string;
  module: string;
  action: string;
  payload?: unknown;
};

export type HostErrorCode = 'VALIDATION' | 'UNSUPPORTED' | 'INTERNAL';

export type HostResponse<T = unknown> =
  | { id?: string; ok: true; data: T }
  | { id?: string; ok: false; error: { code: HostErrorCode; message: string; details?: unknown } };

export type RuntimeHostAction = (payload?: unknown) => Promise<unknown> | unknown;
type MaybePromise<T> = T | Promise<T>;

type HostServiceFunction<TFunction> = TFunction extends (...args: infer Args) => infer Result
  ? (...args: Args) => MaybePromise<Awaited<Result>>
  : never;

type HostServiceModule<TModule> = {
  [A in keyof TModule]: HostServiceFunction<TModule[A]>;
};

export type HostServiceRegistry = {
  [M in keyof HostApiContract]?: Partial<HostServiceModule<NonNullable<HostApiContract[M]>>>;
};

export type CompleteHostServiceRegistry = {
  [M in keyof HostApiContract]: HostServiceModule<NonNullable<HostApiContract[M]>>;
};

export type HostApiContribution = {
  module: string;
  actions: Record<string, RuntimeHostAction>;
};

export type HostApiContributionRegistrar = {
  register: (extensionId: string, contributions: HostApiContribution[]) => () => void;
};

export function isHostRequest(value: unknown): value is HostRequest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && record.id.length > 0
    && typeof record.module === 'string'
    && record.module.length > 0
    && typeof record.action === 'string'
    && record.action.length > 0;
}
