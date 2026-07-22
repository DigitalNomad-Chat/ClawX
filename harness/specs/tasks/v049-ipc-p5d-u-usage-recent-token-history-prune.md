---
id: v049-ipc-p5d-u-usage-recent-token-history-prune
title: v0.4.9 P5-D-U usage recentTokenHistory legacy IPC E2E migration and handler prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: "Migrate tests/e2e/token-usage.spec.ts direct legacy probes from window.electron.ipcRenderer.invoke('usage:recentTokenHistory', n) to host:invoke usage.recentTokenHistory, then remove the legacy usage:recentTokenHistory Main handler and preload whitelist entry. Keep the Main usage host module (createUsageApi), the hostApi.usage.recentTokenHistory facade, and the host-api-client HTTP fallback. Do not touch other D sub-batches, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes, or v0.4.10."
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - tests/e2e/token-usage.spec.ts
  - tests/unit/p5d-u-usage-recent-token-history-zero-call.test.ts
  - harness/specs/tasks/v049-ipc-p5d-u-usage-recent-token-history-prune.md
expectedUserBehavior:
  - No user-visible behavior change; renderer production code uses hostApi.usage.recentTokenHistory.
  - Usage recent token history remains available through host:invoke usage.recentTokenHistory and host-api-client HTTP fallback.
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
  - tests/unit/p5d-u-usage-recent-token-history-zero-call.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/token-usage.spec.ts
  - pnpm run harness:ci
acceptance:
  - tests/e2e/token-usage.spec.ts no longer calls window.electron.ipcRenderer.invoke('usage:recentTokenHistory').
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('usage:recentTokenHistory').
  - electron/preload/index.ts invoke whitelist contains no usage:recentTokenHistory.
  - src/lib/host-api-client.ts HTTP fallback for usage.recentTokenHistory remains intact.
  - Main registerCoreServices usage module and createUsageApi remain intact.
  - M4 gate relevant tests pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-D-U — usage recentTokenHistory legacy IPC E2E migration

## In scope
- Migrate `tests/e2e/token-usage.spec.ts` direct legacy probes to `host:invoke`.
- Remove `usage:recentTokenHistory` legacy IPC handler and preload whitelist entry.
- Preserve `hostApi.usage.recentTokenHistory` facade and HTTP fallback.

## Out of scope
- Other D sub-batches (D-S1/S2/OC/L/UV/W).
- chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5d-u-usage-recent-token-history-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/host-api-facade.test.ts`
4. `pnpm exec playwright test tests/e2e/token-usage.spec.ts`
5. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-D-U commit if any test fails.
