/**
 * App Host API surface (P3a thin service).
 * Shared by HTTP /api/app/openclaw-doctor and host:invoke app.openClawDoctor.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { runOpenClawDoctor, runOpenClawDoctorFix } from '../utils/openclaw-doctor';
import { isRecord } from './payload-utils';

export function createAppApi(): NonNullable<CompleteHostServiceRegistry['app']> {
  return {
    openClawDoctor: async (payload?: unknown) => {
      const mode = isRecord(payload) ? payload.mode : undefined;
      return mode === 'fix' ? runOpenClawDoctorFix() : runOpenClawDoctor();
    },
  };
}
