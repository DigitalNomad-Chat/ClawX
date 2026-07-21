---
id: hermes-server-phase2-batch-e
title: Hermes server phase 2 Batch E.1-E.2 — delete orphaned source files and repository fixture
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Execute the reversible disposal plan authorized after Batch E audit. Delete
  three server-side source files with no live importers and one tracked
  development fixture, after confirming no consumers in docs, tests, runtime,
  or packaging. Do NOT delete or migrate user data, dependencies, lock files,
  or packaged OpenClaw runtime resources.
touchedAreas:
  - server/src/shared/providers.ts
  - server/src/lib/llm-json.ts
  - server/src/lib/llm-prompt.ts
  - packages/server/data/hermes-web-ui.db
  - packages/server/.gitignore
  - harness/specs/tasks/hermes-server-phase2-batch-e.md
expectedUserBehavior:
  - No user-visible behavior change. This batch removes dead code and a stale
    development fixture only.
requiredProfiles:
  - fast
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
requiredTests:
  - pnpm run typecheck
  - pnpm --filter clawx-license-server run typecheck
  - pnpm run harness:ci
  - Hermes regression tests (batch-a/b/c/d)
acceptance:
  - The three source files have no importers in production, test, docs, build,
    or packaging code.
  - The fixture has no runtime or test consumers.
  - Empty parent directories are removed or left in a clean state.
  - A `.gitignore` entry prevents future accidental commits of `.db` fixtures
    under `packages/server/data/`.
  - No production files, user directories, dependencies, or lock files other
    than the listed dead code/fixture were modified or deleted.
docs:
  required: true
---

# Hermes server phase 2 — Batch E.1-E.2

## Scope

- Delete orphaned server-side source files:
  - `server/src/shared/providers.ts`
  - `server/src/lib/llm-json.ts`
  - `server/src/lib/llm-prompt.ts`
- Delete tracked development fixture:
  - `packages/server/data/hermes-web-ui.db`
- Add `packages/server/data/*.db` to `packages/server/.gitignore`.
- Update this harness spec to reflect execution status.

## Out of scope (requires explicit future authorization)

- Deleting or migrating user directories (`~/.hermes-web-ui`,
  `~/Library/Application Support/ClawDock/hermes`, etc.).
- Modifying `package.json` or `pnpm-lock.yaml`.
- Modifying external OpenClaw runtime files
  (`build/openclaw/dist/extensions/migrate-hermes/`).
- Any other source file not listed in scope.

## Stop / escalate conditions

- Any production code is found that still imports the files listed for deletion.
- Any production code still reads `HERMES_WEB_UI_HOME`, `HERMES_DATA_DIR`, or
  `HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN`.
- Any production code writes to legacy Hermes Web UI directories.
- Unrelated changes appear in the working tree.

## Verification

1. `git grep` finds no importers for `server/src/shared/providers.ts`,
   `server/src/lib/llm-json.ts`, or `server/src/lib/llm-prompt.ts`.
2. `git grep` finds no consumers of `packages/server/data/hermes-web-ui.db`.
3. `git status --short` shows only the expected deletions and the `.gitignore`
   addition.
4. `git diff --check` passes.
5. Root `pnpm run typecheck` passes.
6. Server `pnpm run typecheck` passes.
7. `pnpm run harness:ci` passes.
8. Hermes regression tests pass.
