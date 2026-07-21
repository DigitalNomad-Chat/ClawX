---
id: v049-ipc-p4b-b2-settings-setmany
title: v0.4.9 P4b-B2 settings.setMany renderer hostApi facade
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Expose hostApi.settings.setMany over host:invoke with legacy settings:setMany
  IPC fallback on explicit transport codes only. Migrate Settings proxy save and
  QuickModelSwitchDialog persist. Preserve Main setMany semantics: proxy keys
  trigger OpenClaw proxy sync + applyProxy + gateway restart when running;
  launchAtStartup triggers OS login-item sync. Do not migrate other settings
  actions, cron, updates, chat/sessions/media, providers, gateway transport, M4.
  Do not delete legacy handlers.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b2-settings-setmany.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/pages/Settings/index.tsx
  - src/components/models/QuickModelSwitchDialog.tsx
  - tests/unit/host-api-facade.test.ts
  - tests/unit/settings-api.test.ts
  - tests/e2e/settings-proxy.spec.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
expectedUserBehavior:
  - Settings developer proxy save still persists via dual-path setMany.
  - Quick model favorites save via hostApi.settings.setMany.
  - Proxy patch still restarts gateway when running (Main settings-api).
  - launchAtStartup patch still syncs OS login item (Main settings-api).
  - Legacy settings:setMany remains for fallback; other settings CRUD not on facade.
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
  - tests/unit/settings-api.test.ts
  - tests/e2e/settings-proxy.spec.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade settings surface is setMany only (no get/set/reset/getAll).
  - Fallback only on UNSUPPORTED/BRIDGE/CHANNEL_UNAVAILABLE to settings:setMany.
  - Proxy + launchAtStartup side effects locked in settings-api unit tests.
  - Settings proxy E2E still green; host:invoke setMany probe covered.
  - No cron/updates/chat/sessions/media/providers/gateway transport/M4/legacy prune.
docs:
  required: false
---

# v0.4.9 P4b-B2 — settings.setMany facade

## In scope
- `hostApi.settings.setMany(patch)` + legacy IPC fallback
- Settings proxy save + QuickModelSwitchDialog persist
- Lock Main setMany proxy restart + launchAtStartup sync

## Out of scope
settings get/set/reset, cron, updates, chat/sessions/media, providers,
gateway transport, M4, legacy deletion
