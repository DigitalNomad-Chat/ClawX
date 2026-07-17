---
id: v049-ipc-p2-host-invoke-registry
title: v0.4.9 P2 host-contract hostInvoke registry dual-path
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Add Main HostApiRegistry + host:invoke + preload window.clawx.hostInvoke dual-path
  with minimal openclaw/app services. Fix Electron @shared sub-build aliases and
  align shared host-event channel contract to ClawDock preload/host-events.
  Keep host-api-proxy, legacy IPC, HTTP Host API, and #1094 M4 untouched.
  No P3/P4 call-site migration.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p2-host-invoke-registry.md
  - electron/main/ipc/host-contract.ts
  - electron/main/ipc/host-invoke.ts
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - electron/services/app-api.ts
  - electron/services/openclaw-api.ts
  - electron/services/payload-utils.ts
  - shared/host-events/contract.ts
  - src/types/electron.d.ts
  - vite.config.ts
  - tests/unit/host-invoke.test.ts
  - tests/unit/host-event-channels-align.test.ts
  - tests/unit/host-api-contract-smoke.test.ts
expectedUserBehavior:
  - Existing hostapi:fetch/token, legacy ipcMain channels, and M4 runtime dual-emit continue to work.
  - host:invoke is available for registered openclaw/app actions only; unregistered actions return UNSUPPORTED.
  - No page/store migrates to hostInvoke in this phase.
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
  - tests/unit/host-invoke.test.ts
  - tests/unit/host-event-channels-align.test.ts
  - tests/unit/host-api-contract-smoke.test.ts
  - tests/unit/host-events.test.ts
  - tests/unit/gateway-event-dispatch.test.ts
  - tests/unit/chat-runtime-events-normalize.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Electron main/preload vite sub-builds resolve @shared alias.
  - HOST_EVENT_CHANNELS matches ClawDock whatsapp/wechat + kernel:event + chat:runtime-event.
  - host:invoke dual-path registered; host-api-proxy still registered.
  - No P3 service extraction bulk migrate; no P4 renderer facade switch; no M4 edits.
docs:
  required: false
---

# v0.4.9 P2 — host-contract + hostInvoke dual-path

## Order

1. Fix P0 residuals: Electron `@shared` alias + host-event contract drift
2. Add host-contract / host-invoke / minimal services / preload clawx.hostInvoke
3. Verify dual-path; do not migrate call sites (P3/P4)
