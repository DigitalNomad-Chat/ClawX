---
id: hermes-server-phase2-batch-c
title: Hermes server phase 2 Batch C — remove Hermes services, general Koa controllers/services, and context-compressor
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Finish removing the dead Koa/Hermes server-side stack: delete the 5 general
  Koa controllers that survived Batch B, the entire services/hermes/ tree, the
  general Koa services they depended on, and the context-compressor library.
  Any module still referenced by the License server (server/src/index.ts,
  handlers, middleware, utils, types) or OpenClaw/Electron paths must be kept
  and reported. No Batch D/E work.
touchedAreas:
  # Step 1: general Koa controllers (retained from Batch B because they depend on Batch C services)
  - server/src/controllers/auth.ts
  - server/src/controllers/health.ts
  - server/src/controllers/update.ts
  - server/src/controllers/upload.ts
  - server/src/controllers/webhook.ts
  # Step 2: Hermes services
  - server/src/services/hermes/agent-bridge/client.ts
  - server/src/services/hermes/agent-bridge/hermes_bridge.py
  - server/src/services/hermes/agent-bridge/index.ts
  - server/src/services/hermes/agent-bridge/manager.ts
  - server/src/services/hermes/context-engine/compressor.ts
  - server/src/services/hermes/context-engine/gateway-client.ts
  - server/src/services/hermes/context-engine/index.ts
  - server/src/services/hermes/context-engine/prompt.ts
  - server/src/services/hermes/context-engine/summary-cache.ts
  - server/src/services/hermes/context-engine/types.ts
  - server/src/services/hermes/conversations.ts
  - server/src/services/hermes/copilot-device-flow.ts
  - server/src/services/hermes/copilot-models.ts
  - server/src/services/hermes/file-provider.ts
  - server/src/services/hermes/gateway-manager.ts
  - server/src/services/hermes/group-chat/agent-clients.ts
  - server/src/services/hermes/group-chat/index.ts
  - server/src/services/hermes/hermes-cli.ts
  - server/src/services/hermes/hermes-kanban.ts
  - server/src/services/hermes/hermes-path.ts
  - server/src/services/hermes/hermes-profile.ts
  - server/src/services/hermes/model-context.ts
  - server/src/services/hermes/plugins.ts
  - server/src/services/hermes/profile-credentials.ts
  - server/src/services/hermes/run-chat/abort.ts
  - server/src/services/hermes/run-chat/bridge-message.ts
  - server/src/services/hermes/run-chat/compression.ts
  - server/src/services/hermes/run-chat/content-blocks.ts
  - server/src/services/hermes/run-chat/handle-api-run.ts
  - server/src/services/hermes/run-chat/handle-bridge-run.ts
  - server/src/services/hermes/run-chat/index.ts
  - server/src/services/hermes/run-chat/message-format.ts
  - server/src/services/hermes/run-chat/response-stream.ts
  - server/src/services/hermes/run-chat/response-utils.ts
  - server/src/services/hermes/run-chat/session-command.ts
  - server/src/services/hermes/run-chat/sse-utils.ts
  - server/src/services/hermes/run-chat/types.ts
  - server/src/services/hermes/run-chat/usage.ts
  - server/src/services/hermes/session-deleter.ts
  - server/src/services/hermes/session-sync.ts
  - server/src/services/hermes/tts.ts
  # Step 3: general Koa services
  - server/src/services/app-config.ts
  - server/src/services/auth.ts
  - server/src/services/config-helpers.ts
  - server/src/services/credentials.ts
  - server/src/services/gateway-bootstrap.ts
  - server/src/services/logger.ts
  - server/src/services/login-limiter.ts
  - server/src/services/safe-file-store.ts
  - server/src/services/shutdown.ts
  # Step 4: Koa library
  - server/src/lib/context-compressor/export-compressor.ts
  - server/src/lib/context-compressor/index.ts
  # Test/spec updates
  - harness/specs/tasks/hermes-server-phase2-batch-c.md
  - tests/unit/hermes-server-batch-b.test.ts
  - tests/unit/hermes-server-batch-c.test.ts
expectedUserBehavior:
  - No user-visible behavior change; the removed Koa/Hermes server stack is not
    used by the Electron/OpenClaw runtime or the License server.
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
  - tests/unit/hermes-server-batch-b.test.ts
  - tests/unit/hermes-server-batch-c.test.ts
acceptance:
  - All listed controllers, services, and library files no longer exist.
  - No live code in server/src/index.ts, handlers, middleware, utils, types,
    electron/, src/, or scripts/ imports any deleted module.
  - Root typecheck passes; server typecheck does not introduce errors outside
    the expected Koa dead-code removal baseline.
docs:
  required: false
---

# Hermes server phase 2 — Batch C

## Scope

Delete in this exact order:

1. `server/src/controllers/{auth,health,update,upload,webhook}.ts`
2. `server/src/services/hermes/**/*`
3. `server/src/services/{app-config,auth,config-helpers,credentials,gateway-bootstrap,logger,login-limiter,safe-file-store,shutdown}.ts`
4. `server/src/lib/context-compressor/*`

## Out of scope (Batch D/E)

- `server/src/config.ts`
- `server/src/db/index.ts`
- `electron/main/index.ts` `HERMES_*` env vars
- License server (`server/src/index.ts`, handlers, middleware, utils, types)
- Electron renderer/main, OpenClaw runtime, M4, P4b
- `package.json` dependency audit

## Reference graph

### Step 1 — general Koa controllers

These controllers have no live importers. Their outgoing imports are:

- `controllers/auth.ts` → `services/credentials`, `services/auth`, `services/login-limiter`
- `controllers/webhook.ts` → `services/logger`
- `controllers/health.ts` → `services/hermes/hermes-cli`, `services/gateway-bootstrap`
- `controllers/upload.ts` → `config` (Batch D, untouched)
- `controllers/update.ts` → no internal service imports

### Step 2 — Hermes services

`services/hermes/*` is only referenced by:

- `controllers/health.ts` (deleted in Step 1)
- internal `services/hermes/*` references
- `services/hermes/run-chat/*` → `lib/context-compressor/*` (deleted in Step 4)
- `services/hermes/context-engine/compressor.ts` → `services/logger`
- `services/hermes/group-chat/*` → `services/auth`, `services/logger`
- `services/hermes/run-chat/handle-bridge-run.ts` → `services/config-helpers`
- `services/hermes/gateway-manager.ts` → `services/safe-file-store`

No License server or Electron imports.

### Step 3 — general Koa services

Outgoing/import references:

- `services/auth.ts` → `services/credentials`
- `services/config-helpers.ts` → `services/safe-file-store`
- `services/credentials.ts` → `config` (Batch D)
- `services/login-limiter.ts` → `config` (Batch D)

Remaining importers after Steps 1–2:

- `services/auth.ts` ← `controllers/auth.ts` (Step 1), `services/hermes/group-chat/*` (Step 2)
- `services/credentials.ts` ← `controllers/auth.ts` (Step 1), `services/auth.ts`
- `services/logger.ts` ← `controllers/webhook.ts` (Step 1), `services/hermes/context-engine/compressor.ts`, `services/hermes/group-chat/*`, `lib/context-compressor/*`
- `services/gateway-bootstrap.ts` ← `controllers/health.ts` (Step 1)
- `services/config-helpers.ts` ← `services/hermes/run-chat/handle-bridge-run.ts` (Step 2)
- `services/safe-file-store.ts` ← `services/config-helpers.ts`, `services/hermes/gateway-manager.ts` (Step 2)
- `services/app-config.ts` — no importers (dead code)
- `services/shutdown.ts` — no importers (dead code)

### Step 4 — context-compressor

`lib/context-compressor/*` is only referenced by `services/hermes/run-chat/*` (Step 2).

## Verification

1. `git status --short` shows only Batch C files.
2. `git diff --check` passes.
3. Root `pnpm run typecheck` passes.
4. Server typecheck (`cd server && pnpm run typecheck`) compared item-by-item with Batch B baseline. New errors are expected only from removing the listed dead code and must be documented.
5. Regression tests pass.
6. `pnpm run harness:ci` passes / remains aligned.

## Stop / escalate conditions

- Any deleted module is imported by License server (`server/src/index.ts`, handlers, middleware, utils, types).
- Any deleted module is imported by Electron main/renderer or OpenClaw runtime.
- New typecheck errors appear outside the expected Koa dead-code removal baseline.
- Unrelated changes appear in the working tree.
