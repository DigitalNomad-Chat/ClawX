---
id: v049-ipc-p5c-dialog-shell-save-show-prune
title: v0.4.9 P5-C dialog save/message + shell showItemInFolder legacy prune
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: "Remove legacy IPC handlers for dialog:save, dialog:message, and shell:showItemInFolder because renderer has no direct business calls (only host-api-client.ts fallback). Keep hostApi.dialog.save/message, hostApi.shell.showItemInFolder, and Main registerCoreServices dialog/shell modules intact. Do not touch dialog:open, shell:openPath/openExternal, skills batch A, batch D, hostapi:fetch/token, gateway/chat/auth/member/office-tools/desensitize/hermes, or v0.4.10."
touchedAreas:
  - electron/main/ipc-handlers.ts
  - electron/preload/index.ts
  - src/lib/host-api-client.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/p5c-dialog-shell-save-show-zero-call.test.ts
  - harness/specs/tasks/v049-ipc-p5c-dialog-shell-save-show-prune.md
expectedUserBehavior:
  - No user-visible behavior change; these channels had no direct renderer callers.
  - hostApi.dialog.save/message and hostApi.shell.showItemInFolder continue to
    work through host:invoke.
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
  - tests/unit/p5c-dialog-shell-save-show-zero-call.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/chat-history-poll.test.ts
  - tests/unit/chat-send-stale.test.ts
  - tests/unit/chat-new-session-run-cache.test.ts
  - tests/unit/image-generation-status.test.ts
  - pnpm run harness:ci
acceptance:
  - electron/main/ipc-handlers.ts contains no ipcMain.handle('dialog:save/message') or ipcMain.handle('shell:showItemInFolder').
  - electron/preload/index.ts invoke whitelist contains no dialog:save/message or shell:showItemInFolder.
  - src/lib/host-api-client.ts FALLBACKS has no shell.showItemInFolder, dialog.save, or dialog.message entries.
  - hostApi.dialog.save/message and hostApi.shell.showItemInFolder still route to host:invoke.
  - dialog:open, shell:openPath/openExternal, and all excluded channels remain untouched.
  - M4 gate tests all pass.
  - harness:ci passes.
docs:
  required: false
---

# v0.4.9 P5-C — dialog save/message + shell showItemInFolder legacy prune

## In scope
- Remove legacy `dialog:save`, `dialog:message`, and `shell:showItemInFolder` IPC handlers.
- Clean up preload whitelist and renderer-side fallback entries.

## Out of scope
- `dialog:open`, `shell:openPath`, `shell:openExternal`.
- Batch A (`skill:*`), batch D, and all permanently excluded channels.
- v0.4.10 work.

## Verification
1. `pnpm run typecheck`
2. `pnpm exec vitest run tests/unit/p5c-dialog-shell-save-show-zero-call.test.ts`
3. `pnpm exec vitest run tests/unit/host-api-facade.test.ts`
4. M4 gate unit tests
5. `pnpm run harness:ci`

## Rollback
- Single `git revert` of the P5-C commit if any test fails.
