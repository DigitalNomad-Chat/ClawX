---
id: v049-ipc-p3c-config-schedule-services
title: v0.4.9 P3c config and schedule service extraction
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Extract a minimal medium-risk surface for skills config, channels list/get/setEnabled,
  providers list/hasApiKey, and cron delete/toggle/trigger into services with thin
  IPC/HTTP wrappers. Lock credential non-logging, write side effects, and return
  shapes. Keep host-api-proxy and all legacy paths. No chat/sessions/media/M4/P4.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p3c-config-schedule-services.md
  - shared/host-api/contract.ts
  - electron/services/skills-api.ts
  - electron/services/channels-api.ts
  - electron/services/providers-api.ts
  - electron/services/cron-api.ts
  - electron/main/ipc-handlers.ts
  - electron/api/routes/skills.ts
  - tests/unit/skills-api.test.ts
  - tests/unit/channels-api.test.ts
  - tests/unit/cron-api.test.ts
  - tests/e2e/p3c-skills-config.spec.ts
expectedUserBehavior:
  - skill config get/update return shapes unchanged; apiKey not logged by services.
  - channel list/get/setEnabled preserve success envelopes; setEnabled still restarts Gateway.
  - provider list/hasApiKey unchanged; getApiKey remains legacy-only.
  - cron delete/toggle/trigger still RPC to Gateway with prior errors.
  - chat/sessions/media/M4/proxy deletion untouched.
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
  - tests/unit/skills-api.test.ts
  - tests/unit/channels-api.test.ts
  - tests/unit/cron-api.test.ts
  - tests/e2e/p3c-skills-config.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Minimal medium-risk subset only; complex cron list/create/update deferred.
  - Dual-path retained; no P4 migration.
docs:
  required: false
---

# v0.4.9 P3c — Config & schedule (minimal)

## In this batch
- skills: getConfig / getAllConfigs / updateConfig
- channels: listConfigured / getConfig / setEnabled
- providers: list / listVendors / listAccounts / hasApiKey (no getApiKey)
- cron: delete / toggle / trigger (not list/create/update)

## Deferred
cron list/create/update transforms; channel save/delete/OAuth; provider save/key write via host:invoke
