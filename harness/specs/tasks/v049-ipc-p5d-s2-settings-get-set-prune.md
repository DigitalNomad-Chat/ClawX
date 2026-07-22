---
id: v049-ipc-p5d-s2-settings-get-set-prune
title: v0.4.9 P5-D-S2 settings get/getAll/set/reset legacy IPC handler prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: "Remove the legacy settings:get/getAll/set/reset IPC handlers and preload whitelist entries. Renderer production code already routes these channels through app:request via UNIFIED_CHANNELS, so no src changes are required. Migrate direct legacy probes in tests/e2e/settings-proxy.spec.ts and tests/e2e/p4b-b2-settings-setmany.spec.ts to app:request unified routing (or host:invoke). Update tests/unit/api-client.test.ts fallback assertion to use a channel that retains a legacy handler. Keep the settings host module (createSettingsApi), registerCoreServices.settings, app:request settings case, and UNIFIED_CHANNELS entries. Do not touch settings:setMany (D-S1), other D sub-batches, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes, or v0.4.10."
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - tests/e2e/settings-proxy.spec.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
  - tests/unit/api-client.test.ts
  - tests/unit/p5d-s2-settings-get-set-zero-call.test.ts
  - harness/specs/tasks/v049-ipc-p5d-s2-settings-get-set-prune.md
expectedUserBehavior:
  - No user-visible behavior change; renderer settings reads/writes continue through app:request unified routing.
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
  - tests/unit/p5d-s2-settings-get-set-zero-call.test.ts
  - tests/unit/api-client.test.ts
  - tests/e2e/p4b-b2-settings-setmany.spec.ts
  - tests/e2e/settings-proxy.spec.ts
  - pnpm run harness:ci
acceptance:
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('settings:get'/'settings:getAll'/'settings:set'/'settings:reset').
  - electron/preload/index.ts invoke whitelist contains none of settings:get/getAll/set/reset.
  - src/lib/host-api-client.ts has no settings:get/getAll/set/reset fallback.
  - No test or harness spec calls window.electron.ipcRenderer.invoke('settings:get/getAll/set/reset').
  - Renderer production code (QuickModelSwitchDialog, api-client gateway token fallback) still works via app:request/UNIFIED_CHANNELS.
  - M4 gate relevant tests pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-D-S2 — settings get/getAll/set/reset legacy IPC handler prune

## In scope
- Delete `settings:get/getAll/set/reset` legacy IPC handlers.
- Remove corresponding preload whitelist entries.
- Migrate direct legacy `ipcRenderer.invoke('settings:*')` probes in E2E tests to `app:request` unified routing.
- Update `api-client.test.ts` legacy-fallback assertion to use a channel that still has a legacy handler.

## Out of scope
- `settings:setMany` (D-S1 already completed).
- Other D sub-batches, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5d-s2-settings-get-set-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/api-client.test.ts`
4. `pnpm exec playwright test tests/e2e/p4b-b2-settings-setmany.spec.ts`
5. `pnpm exec playwright test tests/e2e/settings-proxy.spec.ts`
6. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-D-S2 commit if any test fails.
