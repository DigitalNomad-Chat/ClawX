---
id: v049-ipc-p4b-b3-cron-write-facade
title: v0.4.9 P4b-B3 cron delete/toggle/trigger renderer hostApi facade
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Expose hostApi cron delete/toggle/trigger over host:invoke with legacy
  cron IPC fallback on explicit transport codes only. Migrate cron store write
  actions only. Keep list/create/update on hostApiFetch because transform and
  repair and delivery validation is complex — do not register or migrate those
  on the facade. Lock Main RPC params for remove update and force run, error
  rethrow, and no gateway restart side effect. No settings updates chat sessions
  media providers gateway transport M4 or legacy prune.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b3-cron-write-facade.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/stores/cron.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/cron-api.test.ts
  - tests/e2e/p4b-b3-cron-write-facade.spec.ts
expectedUserBehavior:
  - Cron job toggle/delete/trigger use hostApi.cron dual-path.
  - Cron list/create/update remain HTTP hostApiFetch.
  - Legacy cron:* IPC remains for fallback; list/create/update not on facade.
  - Main delete/toggle/trigger keep RPC contracts and rethrow errors without restart.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - host-events-fallback-policy
  - gateway-readiness-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/host-api-facade.test.ts
  - tests/unit/cron-api.test.ts
  - tests/e2e/p4b-b3-cron-write-facade.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade cron surface is delete/toggle/trigger only.
  - Fallback only on UNSUPPORTED/BRIDGE/CHANNEL_UNAVAILABLE to cron:* IPC.
  - RPC params and no-restart side effect locked in cron-api unit tests.
  - Cron UI E2E covers toggle via dual-path without list/create migration.
  - No other domains, M4, or legacy deletion.
docs:
  required: false
---

# v0.4.9 P4b-B3 — cron delete / toggle / trigger facade

## In scope
- `hostApi.cron.{delete,toggle,trigger}` + legacy IPC fallback
- `src/stores/cron.ts` write actions only
- Lock Main RPC: remove / update patch.enabled / run force

## Out of scope
cron list/create/update registration or migration, settings, updates, chat,
sessions, media, providers, gateway transport, M4, legacy prune
