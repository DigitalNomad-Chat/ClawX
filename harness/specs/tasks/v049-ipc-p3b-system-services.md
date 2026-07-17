---
id: v049-ipc-p3b-system-services
title: v0.4.9 P3b system low-risk service API extraction
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Extract shell/dialog/window/uv/logs/settings and remaining openclaw dir helpers
  into electron/services/*-api with thin IPC/HTTP wrappers. Preserve sync/async,
  error, and proxy/permission side effects. Keep host-api-proxy, legacy channels,
  HTTP Host API, and host:invoke dual-path. No chat/sessions/media/M4/P4.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p3b-system-services.md
  - shared/host-api/contract.ts
  - electron/services/shell-api.ts
  - electron/services/dialog-api.ts
  - electron/services/uv-api.ts
  - electron/services/logs-api.ts
  - electron/services/window-api.ts
  - electron/services/settings-api.ts
  - electron/services/openclaw-api.ts
  - electron/main/ipc-handlers.ts
  - electron/api/routes/logs.ts
  - electron/api/routes/settings.ts
  - tests/unit/shell-api.test.ts
  - tests/unit/uv-api.test.ts
  - tests/unit/logs-api.test.ts
  - tests/unit/settings-api.test.ts
expectedUserBehavior:
  - shell/dialog/window/uv/log/settings IPC channels keep prior arg shapes and outcomes.
  - settings proxy/launch side effects still restart gateway and sync OpenClaw proxy when needed.
  - HTTP /api/logs* and /api/settings* share service implementations with IPC.
  - host:invoke can resolve shell/dialog/uv/logs/window/settings/openclaw dir actions.
  - chat/sessions/media/images, sendWithMedia, M4, and host-api-proxy remain unchanged.
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
  - tests/unit/shell-api.test.ts
  - tests/unit/uv-api.test.ts
  - tests/unit/logs-api.test.ts
  - tests/unit/settings-api.test.ts
  - tests/unit/openclaw-api.test.ts
  - tests/unit/host-invoke.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Only system low-risk domains extracted in this batch.
  - Thin wrappers only; dual-path retained.
  - Settings proxy/launch side effects preserved.
  - No P4 migration or high-risk chat domains.
docs:
  required: false
---

# v0.4.9 P3b — System low-risk services

## Domains

shell, dialog, window, uv, logs, settings, openclaw getDir/getConfigDir

## Out of scope

chat, sessions, media, images, sendWithMedia, M4, proxy deletion, P4, v0.4.10
