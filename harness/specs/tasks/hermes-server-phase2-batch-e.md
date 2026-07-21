---
id: hermes-server-phase2-batch-e
title: Hermes server phase 2 Batch E — dependency, resource and runtime directory audit
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Read-only safety audit after Batch A/B/C/D. Inventory remaining Hermes/Koa
  fingerprints in dependencies (package.json, pnpm-lock), packaged resources,
  source code path references, and runtime directories. Propose a reversible
  disposal plan and verification gates. Do NOT delete or migrate user data,
  databases, dependencies, lock files, or packaged resources.
touchedAreas:
  - docs/2026-07-21-Hermes-server-phase2-batch-e-audit.md
  - docs/2026-07-21-Hermes-server-phase2-cleanup-plan.md
  - harness/specs/tasks/hermes-server-phase2-batch-e.md
expectedUserBehavior:
  - No user-visible behavior change. This batch is documentation and audit only.
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
  - Audit report documents all remaining Hermes/Koa fingerprints.
  - Report distinguishes ClawDock code, external OpenClaw runtime, and user data.
  - Report includes reversible disposal plan with explicit authorization gates.
  - No production files, user directories, dependencies, or lock files were
    modified or deleted.
docs:
  required: true
---

# Hermes server phase 2 — Batch E

## Scope

Read-only audit only.

- Inventory direct/transitive dependencies related to Hermes/Koa.
- Inventory packaged resources and build assets.
- Inventory source-code path fingerprints.
- Inventory runtime directories and repository fixtures.
- Identify live consumers (if any).
- Propose reversible disposal plan and verification thresholds.

## Out of scope (requires explicit future authorization)

- Deleting or migrating user directories (`~/.hermes-web-ui`,
  `~/Library/Application Support/ClawDock/hermes`, etc.).
- Deleting repository fixtures (`packages/server/data/hermes-web-ui.db`).
- Deleting unused server-side source files
  (`server/src/shared/providers.ts`, `server/src/lib/llm-json.ts`,
  `server/src/lib/llm-prompt.ts`).
- Modifying `package.json` or `pnpm-lock.yaml`.
- Modifying external OpenClaw runtime files
  (`build/openclaw/dist/extensions/migrate-hermes/`).

## Stop / escalate conditions

- Any production code is found that still reads `HERMES_WEB_UI_HOME`,
  `HERMES_DATA_DIR`, or `HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN`.
- Any production code writes to legacy Hermes Web UI directories.
- Unrelated changes appear in the working tree.

## Verification

1. `git status --short` shows only docs/harness changes.
2. `git diff --check` passes.
3. Root `pnpm run typecheck` passes.
4. Server `pnpm run typecheck` passes.
5. `pnpm run harness:ci` passes.
6. Hermes regression tests pass.
