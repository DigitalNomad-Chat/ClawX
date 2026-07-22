---
id: v049-ipc-p5b-app-metadata-prune
title: v0.4.9 P5-B app metadata legacy IPC handler prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Remove the dedicated legacy IPC handlers for app metadata
  (app:version, app:name, app:getPath, app:platform, app:quit, app:relaunch)
  because the audit report f66d8dc1 confirms zero business calls in
  renderer/preload/tests/harness (excluding docs/comments/fixtures history).
  Retain hostApi.app module, Main app host module, app:request internal
  functionality, and all non-metadata app channels. Do not touch gateway,
  chat, auth/member/office-tools/desensitize/hermes, hostapi:fetch/token,
  or v0.4.10 scope.
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - src/lib/api-client.ts
  - harness/specs/tasks/v049-ipc-p5b-app-metadata-prune.md
  - tests/unit/p5b-app-metadata-zero-call.test.ts
expectedUserBehavior:
  - No user-facing behavior change; no renderer code called these channels.
  - app:request unified protocol continues to function for remaining channels.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - gateway-readiness-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/p5b-app-metadata-zero-call.test.ts
  - tests/unit/host-api-facade.test.ts
  - pnpm exec vitest run tests/unit/chat-runtime-evidence.test.ts
  - pnpm exec vitest run tests/unit/chat-history-poll.test.ts
  - pnpm exec vitest run tests/unit/chat-send-stale.test.ts
  - pnpm exec vitest run tests/unit/chat-new-session-run-cache.test.ts
  - pnpm exec vitest run tests/unit/image-generation-status.test.ts
  - pnpm run harness:ci
acceptance:
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('app:version/name/getPath/platform/quit/relaunch').
  - registerAppHandlers() is removed or empty and its call site is removed.
  - electron/preload/index.ts invoke whitelist contains no app:version/name/getPath/platform/quit/relaunch.
  - src/lib/api-client.ts UNIFIED_CHANNELS contains no app:version/name/platform.
  - hostApi.app module and Main app host module remain intact.
  - app:request unified handler internal functionality remains intact.
  - M4 gate tests all pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-B — app metadata legacy IPC handler prune

## In scope
- Remove legacy `app:version`, `app:name`, `app:getPath`, `app:platform`, `app:quit`, `app:relaunch` IPC handlers.
- Clean up preload whitelist and renderer-side `UNIFIED_CHANNELS` routing for these metadata actions.

## Out of scope
- `hostApi.app` facade and Main `app` host module (keep).
- `app:request` unified protocol handler and its internal `case 'app'` branch (keep).
- All non-metadata app channels / functionality.
- Gateway, chat runtime/send, auth/member/office-tools/desensitize/hermes, hostapi:fetch/token.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5b-app-metadata-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/host-api-facade.test.ts`
4. M4 gate unit tests
5. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-B commit if any test fails or behavior regresses.
