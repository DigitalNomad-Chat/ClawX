import assert from "node:assert/strict";
import test from "node:test";
import { nextContinuousMonitorDelayMs } from "../src/runtime/monitor";

test("nextContinuousMonitorDelayMs backs off on repeated idle runs", () => {
  const first = nextContinuousMonitorDelayMs(10_000, 0, {
    alertsCount: 0,
    changed: false,
    heartbeatExecuted: 0,
  }, 60_000);
  assert.deepEqual(first, { delayMs: 20_000, idleStreak: 1 });

  const second = nextContinuousMonitorDelayMs(10_000, first.idleStreak, {
    alertsCount: 0,
    changed: false,
    heartbeatExecuted: 0,
  }, 60_000);
  assert.deepEqual(second, { delayMs: 40_000, idleStreak: 2 });

  const capped = nextContinuousMonitorDelayMs(10_000, 4, {
    alertsCount: 0,
    changed: false,
    heartbeatExecuted: 0,
  }, 60_000);
  assert.deepEqual(capped, { delayMs: 60_000, idleStreak: 4 });
});

test("nextContinuousMonitorDelayMs resets to base interval when work resumes", () => {
  const changed = nextContinuousMonitorDelayMs(10_000, 3, {
    alertsCount: 0,
    changed: true,
    heartbeatExecuted: 0,
  }, 60_000);
  assert.deepEqual(changed, { delayMs: 10_000, idleStreak: 0 });

  const alerting = nextContinuousMonitorDelayMs(10_000, 2, {
    alertsCount: 1,
    changed: false,
    heartbeatExecuted: 0,
  }, 60_000);
  assert.deepEqual(alerting, { delayMs: 10_000, idleStreak: 0 });
});
