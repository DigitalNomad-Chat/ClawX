import { describe, expect, it } from 'vitest';
import {
  HostApiRegistry,
  createHostInvokeDispatcher,
} from '../../electron/main/ipc/host-invoke';

describe('host-invoke dispatcher', () => {
  it('rejects invalid request shape', async () => {
    const dispatch = createHostInvokeDispatcher({});
    const res = await dispatch({ module: 'app' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
  });

  it('returns UNSUPPORTED for unknown module.action', async () => {
    const dispatch = createHostInvokeDispatcher({});
    const res = await dispatch({ id: '1', module: 'openclaw', action: 'status' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNSUPPORTED');
  });

  it('dispatches registered action', async () => {
    const registry = new HostApiRegistry();
    registry.registerCoreServices({
      openclaw: { status: async () => ({ packageExists: true }) },
    });
    const dispatch = createHostInvokeDispatcher(registry);
    const res = await dispatch({ id: '1', module: 'openclaw', action: 'status' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ packageExists: true });
  });

  it('maps thrown errors to INTERNAL', async () => {
    const registry = new HostApiRegistry();
    registry.registerCoreServices({
      app: {
        openClawDoctor: async () => {
          throw new Error('boom');
        },
      },
    });
    const dispatch = createHostInvokeDispatcher(registry);
    const res = await dispatch({ id: '2', module: 'app', action: 'openClawDoctor' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INTERNAL');
      expect(res.error.message).toBe('boom');
    }
  });

  it('rejects duplicate action registration', () => {
    const registry = new HostApiRegistry();
    registry.registerCoreServices({
      openclaw: { status: () => ({}) },
    });
    expect(() => {
      registry.registerCoreServices({
        openclaw: { status: () => ({}) },
      });
    }).toThrow(/already registered/);
  });
});
