---
id: v049-ipc-p3a-low-risk-services
title: v0.4.9 P3a low-risk service API extraction
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Extract low-risk domains (app doctor, openclaw status/skills/cli, usage token history)
  into electron/services/*-api with thin IPC/HTTP wrappers. Register usage on host:invoke
  dual-path. Preserve host-api-proxy, legacy channels, HTTP Host API, and M4. No chat/
  sessions/media/images migration and no P4 call-site changes.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p3a-low-risk-services.md
  - electron/services/app-api.ts
  - electron/services/openclaw-api.ts
  - electron/services/usage-api.ts
  - electron/main/ipc-handlers.ts
  - electron/api/routes/app.ts
  - electron/api/routes/usage.ts
  - tests/unit/app-api.test.ts
  - tests/unit/openclaw-api.test.ts
  - tests/unit/usage-api.test.ts
  - tests/unit/host-invoke-p3a-services.test.ts
expectedUserBehavior:
  - openclaw:status / getSkillsDir / getCliCommand behavior unchanged via thin service.
  - /api/app/openclaw-doctor still returns doctor diagnose/fix results.
  - usage:recentTokenHistory and /api/usage/recent-token-history share createUsageApi limit rules.
  - host:invoke can call openclaw.* and usage.recentTokenHistory without removing legacy IPC.
  - chat/sessions/media/M4/host-api-proxy untouched.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - host-events-fallback-policy
  - gateway-readiness-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/app-api.test.ts
  - tests/unit/openclaw-api.test.ts
  - tests/unit/usage-api.test.ts
  - tests/unit/host-invoke-p3a-services.test.ts
  - tests/unit/host-invoke.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Selected domains are low-risk only (no chat/sessions/media/images).
  - routes/handlers are thin wrappers over services.
  - HTTP + legacy IPC + host:invoke dual-path retained.
  - No P4 page migration; no host-api-proxy deletion; no M4 edits.
docs:
  required: false
---

# v0.4.9 P3a — Low-risk service extraction

## Domains (this batch)

| Domain | Service | Thin wrappers |
|--------|---------|---------------|
| app doctor | `createAppApi` | `/api/app/openclaw-doctor`, host:invoke |
| openclaw | `createOpenClawApi` | `openclaw:status|getSkillsDir|getCliCommand|isReady` IPC, host:invoke |
| usage | `createUsageApi` | `usage:recentTokenHistory` IPC, `/api/usage/recent-token-history`, host:invoke |

## Explicitly out of scope

chat, sessions, media, images, sendWithMedia, M4, host-api-proxy removal, P4 renderer migration, v0.4.10.
