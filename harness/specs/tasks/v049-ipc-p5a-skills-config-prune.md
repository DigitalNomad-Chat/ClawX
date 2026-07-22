---
id: v049-ipc-p5a-skills-config-prune
title: v0.4.9 P5-A skills config legacy IPC handler prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: "Migrate tests/e2e/p3c-skills-config.spec.ts direct legacy probe from window.electron.ipcRenderer.invoke('skill:getAllConfigs') to host:invoke skills.getAllConfigs, then remove the legacy skill:getConfig/getAllConfigs/updateConfig IPC handlers, preload whitelist entries, and any related fallback. Keep the Main skills host module (createSkillsApi) and all other skills handlers/actions intact. Do not touch P5-D, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes, or v0.4.10."
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - tests/e2e/p3c-skills-config.spec.ts
  - tests/unit/p5a-skills-config-zero-call.test.ts
  - harness/specs/tasks/v049-ipc-p5a-skills-config-prune.md
expectedUserBehavior:
  - No user-visible behavior change; renderer production code does not use these legacy skill channels.
  - Skills config remains available through host:invoke skills.getConfig/getAllConfigs/updateConfig.
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
  - tests/unit/p5a-skills-config-zero-call.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/chat-history-poll.test.ts
  - tests/unit/chat-send-stale.test.ts
  - tests/unit/chat-new-session-run-cache.test.ts
  - tests/unit/image-generation-status.test.ts
  - tests/e2e/p3c-skills-config.spec.ts
  - pnpm run harness:ci
acceptance:
  - tests/e2e/p3c-skills-config.spec.ts no longer calls window.electron.ipcRenderer.invoke('skill:getAllConfigs') or other skill:* legacy channels.
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('skill:getConfig'/'skill:getAllConfigs'/'skill:updateConfig').
  - electron/preload/index.ts invoke whitelist contains no skill:getConfig/getAllConfigs/updateConfig.
  - src/lib/host-api-client.ts has no skill:* fallback (already true; remains true).
  - Main registerCoreServices skills module and createSkillsApi remain intact.
  - M4 gate tests all pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-A — skills config legacy IPC handler prune

## In scope
- Migrate the direct legacy probe in `tests/e2e/p3c-skills-config.spec.ts` to `host:invoke`.
- Remove `skill:getConfig`, `skill:getAllConfigs`, `skill:updateConfig` legacy IPC handlers.
- Clean up preload whitelist.

## Out of scope
- Other skills handlers/actions (e.g. hostapi skills HTTP routes, host:invoke skills module).
- P5-D, chat/gateway, hostapi:fetch/token, auth/member/office-tools/desensitize/hermes.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5a-skills-config-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/host-api-facade.test.ts`
4. M4 gate unit tests
5. `pnpm exec playwright test tests/e2e/p3c-skills-config.spec.ts`
6. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-A commit if any test fails.
