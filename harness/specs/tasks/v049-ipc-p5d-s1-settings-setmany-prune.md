---
id: v049-ipc-p5d-s1-settings-setmany-prune
title: v0.4.9 P5-D-S1 settings.setMany fallback cleanup and handler prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: "Remove the legacy settings:setMany IPC handler and preload whitelist entry. Change host-api-client.ts fallback for settings.setMany from legacy IPC invoke to noFallback. Update tests/unit/host-api-facade.test.ts and tests/e2e/p4b-b2-settings-setmany.spec.ts to stop testing legacy IPC fallback. Keep the settings host module (createSettingsApi), registerCoreServices.settings, app:request settings handlers, and all other settings channels (get/getAll/set/reset for D-S2). Do not touch other D sub-batches, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes, or v0.4.10."
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - src/lib/host-api-client.ts
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
  - tests/unit/p5d-s1-settings-setmany-zero-call.test.ts
  - harness/specs/tasks/v049-ipc-p5d-s1-settings-setmany-prune.md
expectedUserBehavior:
  - No user-visible behavior change; renderer uses hostApi.settings.setMany via host:invoke.
  - When host:invoke is unavailable, settings.setMany now fails fast with UNSUPPORTED instead of silently falling back to a removed legacy channel.
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
  - tests/unit/p5d-s1-settings-setmany-zero-call.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
  - tests/e2e/settings-proxy.spec.ts
  - pnpm run harness:ci
acceptance:
  - src/lib/host-api-client.ts settings.setMany fallback is noFallback, not legacy IPC invoke.
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('settings:setMany').
  - electron/preload/index.ts invoke whitelist contains no settings:setMany.
  - tests/unit/host-api-facade.test.ts no longer asserts legacy settings:setMany fallback.
  - tests/e2e/p4b-b2-settings-setmany.spec.ts no longer calls window.electron.ipcRenderer.invoke('settings:setMany') and still validates host:invoke settings.setMany success path.
  - Settings proxy E2E (settings-proxy.spec.ts) still passes.
  - M4 gate relevant tests pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-D-S1 — settings.setMany fallback cleanup

## In scope
- Remove `settings:setMany` legacy IPC handler and preload whitelist.
- Switch `host-api-client.ts` fallback to `noFallback`.
- Update unit/E2E tests that previously exercised the legacy fallback.

## Out of scope
- Other settings channels (`settings:get`, `settings:getAll`, `settings:set`, `settings:reset`) — D-S2.
- Other D sub-batches, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5d-s1-settings-setmany-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/host-api-facade.test.ts`
4. `pnpm exec playwright test tests/e2e/p4b-b2-settings-setmany.spec.ts`
5. `pnpm exec playwright test tests/e2e/settings-proxy.spec.ts`
6. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-D-S1 commit if any test fails.
