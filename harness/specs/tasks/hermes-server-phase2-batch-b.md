---
id: hermes-server-phase2-batch-b
title: Hermes server phase 2 Batch B — remove Hermes controllers and DB layer
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Remove Hermes-specific Koa controllers (server/src/controllers/hermes/*),
  the Hermes SQLite/JSON storage layer (server/src/db/hermes/*), and the last
  remaining Hermes route file (server/src/routes/hermes/group-chat.ts). The
  route file is removed because controllers/hermes/sessions.ts was its only
  importer. Services/hermes and lib/context-compressor still reference db/hermes
  and are intentionally left for Batch C. No config/db/env/Electron/OpenClaw/
  License server/M4/P4b changes.
touchedAreas:
  - server/src/controllers/hermes/codex-auth.ts
  - server/src/controllers/hermes/config.ts
  - server/src/controllers/hermes/copilot-auth.ts
  - server/src/controllers/hermes/cron-history.ts
  - server/src/controllers/hermes/gateways.ts
  - server/src/controllers/hermes/jobs.ts
  - server/src/controllers/hermes/kanban.ts
  - server/src/controllers/hermes/logs.ts
  - server/src/controllers/hermes/memory.ts
  - server/src/controllers/hermes/models.ts
  - server/src/controllers/hermes/nous-auth.ts
  - server/src/controllers/hermes/plugins.ts
  - server/src/controllers/hermes/profiles.ts
  - server/src/controllers/hermes/providers.ts
  - server/src/controllers/hermes/sessions.ts
  - server/src/controllers/hermes/skills.ts
  - server/src/controllers/hermes/tts.ts
  - server/src/controllers/hermes/weixin.ts
  - server/src/controllers/hermes/xai-auth.ts
  - server/src/db/hermes/compression-snapshot.ts
  - server/src/db/hermes/conversations-db.ts
  - server/src/db/hermes/init.ts
  - server/src/db/hermes/schemas.ts
  - server/src/db/hermes/session-store.ts
  - server/src/db/hermes/sessions-db.ts
  - server/src/db/hermes/usage-store.ts
  - server/src/routes/hermes/group-chat.ts
  - harness/specs/tasks/hermes-server-phase2-batch-b.md
  - tests/unit/hermes-server-batch-a.test.ts
  - tests/unit/hermes-server-batch-b.test.ts
expectedUserBehavior:
  - No user-visible behavior change; the removed Koa Web UI server is not used by
    the Electron/OpenClaw runtime.
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
acceptance:
  - server/src/controllers/hermes/* and server/src/db/hermes/* no longer exist.
  - server/src/routes/hermes/group-chat.ts no longer exists.
  - No non-Hermes code imports the deleted controllers or route file.
  - server typecheck changes are limited to expected Batch C files
    (services/hermes/*, lib/context-compressor/*) due to db/hermes removal.
docs:
  required: false
---

# Hermes server phase 2 — Batch B

## Scope

- Delete all files under `server/src/controllers/hermes/` (18 files).
- Delete all files under `server/src/db/hermes/` (7 files).
- Delete `server/src/routes/hermes/group-chat.ts`.
- Remove now-empty `server/src/routes/hermes` and `server/src/routes` directories.
- Add regression test `tests/unit/hermes-server-batch-b.test.ts`.

## Out of scope (Batch C/D/E)

- `server/src/services/hermes/**` (Batch C).
- `server/src/lib/context-compressor/**` (Batch C).
- `server/src/controllers/{health,auth,upload,update,webhook}.ts` (later batch).
- `server/src/config.ts`, `server/src/db/index.ts` (Batch D).
- `electron/main/index.ts` `HERMES_*` env vars (Batch D, HOLD).
- License server (`server/src/index.ts`, handlers, middleware, utils, types).
- Electron renderer/main, OpenClaw runtime, M4, P4b.

## Reference graph

### Controllers → DB imports (all deleted with this batch)

- `controllers/hermes/sessions.ts` imports from `db/hermes/sessions-db`, `db/hermes/session-store`, `db/hermes/usage-store`.
- `controllers/hermes/kanban.ts` imports from `db/hermes/sessions-db`.
- `controllers/hermes/models.ts` imports `MODEL_CONTEXT_TABLE` from `db/hermes/schemas`.
- `controllers/hermes/skills.ts` imports from `db/hermes/sessions-db`.

### Route → controller coupling

- `controllers/hermes/sessions.ts` is the only importer of `getGroupChatServer` from `routes/hermes/group-chat.ts`.
- Deleting `controllers/hermes/sessions.ts` makes `routes/hermes/group-chat.ts` dead code, so it is removed in this batch.

### Remaining `db/hermes` importers (Batch C)

After this batch, the following still reference `db/hermes` and will be resolved in Batch C:

- `server/src/services/hermes/context-engine/gateway-client.ts`
- `server/src/services/hermes/group-chat/agent-clients.ts`
- `server/src/services/hermes/model-context.ts`
- `server/src/services/hermes/run-chat/*.ts`
- `server/src/lib/context-compressor/*.ts`

These are intentionally left in place; Batch B does not enter Batch C.

## Verification

1. `git status --short` shows only Batch B files.
2. `git diff --check` passes.
3. Root `pnpm run typecheck` passes (unchanged baseline; `server/` is not included in root tsconfig).
4. Server typecheck (`cd server && pnpm run typecheck`) is compared item-by-item with Batch A baseline. New errors are expected only in Batch C files due to `db/hermes` removal and must be listed in the task report.
5. Regression test `tests/unit/hermes-server-batch-b.test.ts` passes.
6. `pnpm run harness:ci` passes / remains aligned.

## Stop / escalate conditions

- Any import of `controllers/hermes/*` remains in non-test code.
- Any import of `routes/hermes/group-chat` remains in non-test code.
- `server/src/index.ts`, handlers, middleware, or Electron main import any deleted path.
- New typecheck errors appear outside Batch C files (`services/hermes`, `lib/context-compressor`).
- Unrelated changes appear in the working tree.
