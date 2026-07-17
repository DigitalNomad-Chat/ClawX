/**
 * Minimal app Host API surface for P2 dual-path proof (doctor only).
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { runOpenClawDoctor, runOpenClawDoctorFix } from '../utils/openclaw-doctor';

export function createAppApi(): NonNullable<CompleteHostServiceRegistry['app']> {
  return {
    openClawDoctor: async (payload?: unknown) => {
      const mode = payload && typeof payload === 'object' && 'mode' in payload
        ? (payload as { mode?: unknown }).mode
        : undefined;
      return mode === 'fix' ? runOpenClawDoctorFix() : runOpenClawDoctor();
    },
  };
}
