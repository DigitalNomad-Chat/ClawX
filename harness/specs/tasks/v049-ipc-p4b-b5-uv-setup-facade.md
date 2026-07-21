---
id: v049-ipc-p4b-b5-uv-setup-facade
title: v0.4.9 P4b-B5 UV Setup hostApi facade migration
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Migrate Setup InstallingContent uv.installAll and expose hostApi.uv.check
  for registered Main createUvApi actions. Prefer host:invoke with explicit
  transport-only fallback to legacy uv:check and uv:install-all. Preserve
  Setup progress loading error and skip cancel semantics. Do not add updates
  service. Do not touch settings cron skills providers chat sessions media
  gateway M4 or delete legacy paths.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b5-uv-setup-facade.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/pages/Setup/index.tsx
  - tests/unit/host-api-facade.test.ts
  - tests/unit/uv-api.test.ts
  - tests/e2e/p4b-b5-uv-setup-facade.spec.ts
expectedUserBehavior:
  - Setup install step calls hostApi.uv.installAll dual-path.
  - Progress loading success error and skip UI semantics unchanged.
  - Legacy uv:check and uv:install-all remain for fallback.
  - No updates facade module.
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
  - tests/unit/uv-api.test.ts
  - tests/e2e/p4b-b5-uv-setup-facade.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade uv surface is check and installAll only.
  - Fallback only on explicit transport codes to uv:check / uv:install-all.
  - Setup UI E2E covers install progress and success or error paths.
  - No updates service; no other domain migration; no legacy prune.
docs:
  required: false
---

# v0.4.9 P4b-B5 — UV Setup facade

## In scope
- hostApi.uv.check / hostApi.uv.installAll
- Setup InstallingContent installAll migration
- Legacy IPC fallback uv:check / uv:install-all

## Out of scope
updates service, settings/cron/skills/providers/chat/sessions/media/gateway/M4, legacy deletion
