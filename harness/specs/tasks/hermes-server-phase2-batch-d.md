---
id: hermes-server-phase2-batch-d
title: Hermes server phase 2 Batch D — remove Koa config/DB remnants and Electron HERMES_* env aliases
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Remove the last Koa-specific server artifacts: server/src/config.ts and
  server/src/db/index.ts. Also remove the three legacy HERMES_* environment
  variables that were set in electron/main/index.ts for the deleted Koa Web UI
  server (HERMES_WEB_UI_HOME, HERMES_DATA_DIR,
  HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN). Update the outdated comment that
  referenced server/src/config.ts and HERMES_* legacy aliases. Do not enter
  Batch E. Preserve License server and all OpenClaw/Electron shared
  infrastructure.
touchedAreas:
  - server/src/config.ts
  - server/src/db/index.ts
  - electron/main/index.ts
  - harness/specs/tasks/hermes-server-phase2-batch-d.md
  - tests/unit/hermes-server-batch-c.test.ts
  - tests/unit/hermes-server-batch-d.test.ts
expectedUserBehavior:
  - No user-visible behavior change; the removed Koa config/DB and HERMES_*
    env vars are no longer used by the Electron/OpenClaw runtime or the
    License server.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
requiredTests:
  - pnpm run typecheck
  - pnpm --filter clawx-license-server run typecheck
  - pnpm run harness:ci
  - tests/unit/hermes-server-batch-c.test.ts
  - tests/unit/hermes-server-batch-d.test.ts
acceptance:
  - server/src/config.ts and server/src/db/index.ts no longer exist.
  - electron/main/index.ts no longer sets HERMES_WEB_UI_HOME,
    HERMES_DATA_DIR, or HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN.
  - No code in server/src or electron reads any of the three HERMES_* vars.
  - Root typecheck and server typecheck pass (server typecheck errors from
    Batch C's config.ts/db/index.ts Node-type issues are gone).
docs:
  required: false
---

# Hermes server phase 2 — Batch D

## Scope

- Delete `server/src/config.ts`.
- Delete `server/src/db/index.ts`.
- In `electron/main/index.ts`:
  - Remove `process.env.HERMES_WEB_UI_HOME = ...`
  - Remove `process.env.HERMES_DATA_DIR = ...`
  - Remove `process.env.HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN = '0'`
  - Update the outdated comment at the top of the file that mentioned
    `server/src/config.ts` and HERMES_* legacy aliases.
- Add/update regression tests.

## Out of scope (Batch E)

- `package.json` dependency audit for Koa/socket.io/js-yaml/etc.
- Runtime directory migration (`~/.hermes-web-ui`, `~/.hermes`,
  `<userData>/hermes`).
- `server/src/lib/llm-json.ts` and `server/src/lib/llm-prompt.ts` (unused but
  not Koa-specific; leave for Batch E/resource audit).

## Reference graph

### `server/src/config.ts`

- Imported by `server/src/db/index.ts` only.
- No other server/src, electron/, src/, or scripts/ importer.
- The HERMES_* variables documented inside it are no longer read anywhere.

### `server/src/db/index.ts`

- No live importers after Batch C.

### `HERMES_*` env vars in `electron/main/index.ts`

- Set in `startMainApp()` at lines ~331, ~333, ~334.
- Previously read by deleted `server/src/config.ts`,
  `services/shutdown.ts`, and `services/hermes/gateway-manager.ts`.
- After Batch A/B/C, no code reads these variables.
- Static scan of electron/, scripts/, docs, and external OpenClaw references
  shows no consumers.

## Verification

1. `git status --short` shows only Batch D files.
2. `git diff --check` passes.
3. Root `pnpm run typecheck` passes.
4. Server typecheck (`cd server && pnpm run typecheck`) passes (Batch C's
   Node-type errors in config.ts/db/index.ts are gone).
5. Regression tests pass.
6. `pnpm run harness:ci` passes / remains aligned.
7. Optional: clean-environment E2E smoke to confirm no `HERMES_*` env leakage.

## Stop / escalate conditions

- Any non-Hermes code still imports `server/src/config.ts` or `server/src/db/index.ts`.
- Any code reads one of the three HERMES_* env vars after removal.
- Electron app fails to start or E2E smoke fails.
- New typecheck errors appear outside the expected Koa cleanup baseline.
- Unrelated changes appear in the working tree.
