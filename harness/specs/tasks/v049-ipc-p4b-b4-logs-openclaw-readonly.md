---
id: v049-ipc-p4b-b4-logs-openclaw-readonly
title: v0.4.9 P4b-B4 logs and OpenClaw read-only hostApi facade
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Inventory renderer call sites and expose hostApi.logs read-only actions plus
  openclaw dir/CLI read helpers already registered on Main. Migrate Settings and
  Setup log viewers to hostApi.logs with explicit transport-only fallback to
  legacy log and openclaw IPC. Do not add updates or uv Main services. Do not
  migrate settings writes cron skills providers chat sessions media gateway or
  M4. Do not delete legacy paths.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b4-logs-openclaw-readonly.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/pages/Settings/index.tsx
  - src/pages/Setup/index.tsx
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/p4b-b4-logs-openclaw-readonly.spec.ts
expectedUserBehavior:
  - Settings gateway logs panel loads via hostApi.logs.readFile dual-path.
  - Open log folder uses hostApi.logs.getDir plus shell reveal.
  - OpenClaw getDir getConfigDir getSkillsDir getCliCommand available on facade.
  - Legacy log and openclaw IPC channels remain for fallback.
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
  - tests/e2e/p4b-b4-logs-openclaw-readonly.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade exposes logs read-only and openclaw status/dir/CLI helpers only.
  - No updates/uv modules on facade; no new Main services.
  - Fallback only on explicit transport codes to log:* and openclaw:* IPC.
  - Settings logs UI E2E covers show logs content path.
  - No settings/cron/skills/providers/chat/sessions/media/gateway/M4/legacy prune.
docs:
  required: false
---

# v0.4.9 P4b-B4 — logs + OpenClaw read-only facade

## Inventory (renderer)
- Settings/Setup: `/api/logs?tailLines` and `/api/logs/dir` → migrate to hostApi.logs
- OpenClaw status already on facade (P4a); dir/CLI registered on Main, exposed for helpers
- Skills still uses clawdock:getSkillsDir (out of scope)

## Out of scope
updates/uv Main services, settings writes, cron, skills marketplace, providers,
chat/sessions/media, gateway transport, M4, legacy deletion
