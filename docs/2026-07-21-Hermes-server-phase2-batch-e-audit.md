# Hermes Server Phase 2 Batch E — Dependency, Resource & Runtime Directory Audit

> **Scope**: read-only audit and disposal plan. No user directories, package/lock files,
> packaged resources, or external Hermes environments are modified in this batch.
>
> **Branch**: `feat/membership-system-merge-v0.4.8`
> **Audit base commit**: `2af822b7` (Batch D completion)

## 1. Executive Summary

After Batch A/B/C/D, the Koa/Hermes Web UI product path has been fully removed from
`server/src/`, `electron/main/index.ts`, and the renderer. Batch E is a **safety audit**:
inventory remaining Hermes-related fingerprints in dependencies, packaged assets,
source code, and runtime directories; propose a reversible disposal plan; and define
verification gates before any future deletion/migration is authorized.

**Key findings**:

- No direct `hermes-*` / `koa` / `@koa/router` / `socket.io` / `js-tiktoken` /
  `better-sqlite3` / `sqlite3` dependencies remain in `package.json` or
  `server/package.json`.
- `hermes-parser` and `hermes-estree` remain only as transitive dependencies of
  `eslint-plugin-react-hooks` (Facebook parser, unrelated to Hermes product).
- `js-yaml` remains only as a transitive dependency of `electron-updater` and
  `electron-builder` (unrelated to Hermes).
- No Hermes-related production source code references remain outside docs/tests.
- No Hermes-related files in `resources/`, `public/`, or build scripts.
- `build/openclaw/dist/extensions/migrate-hermes/` exists but is **external OpenClaw
  runtime** code and must not be touched by this cleanup.
- Legacy runtime directories exist on disk from previous app launches:
  - `~/.hermes-web-ui` (Koa Web UI home)
  - `~/Library/Application Support/ClawDock/hermes` / `~/Library/Application Support/clawdock/hermes`
    (Electron `userData/hermes` created by deleted `HERMES_*` env logic)
- A tracked development fixture remains: `packages/server/data/hermes-web-ui.db`.
- Two unused server-side source files remain as cleanup candidates:
  - `server/src/shared/providers.ts` (dead code, was synced from hermes-agent)
  - `server/src/lib/llm-json.ts`, `server/src/lib/llm-prompt.ts` (unused, not
    License-server related)

## 2. Dependency Audit

### Direct dependencies

| Package | In root `package.json` | In `server/package.json` | Status |
|---|---|---|---|
| `koa` | ❌ | ❌ | Already removed |
| `@koa/router` | ❌ | ❌ | Already removed |
| `socket.io` | ❌ | ❌ | Already removed |
| `socket.io-client` | ❌ | ❌ | Already removed |
| `js-tiktoken` | ❌ | ❌ | Already removed |
| `js-yaml` | ❌ (transitive only) | ❌ | Keep — used by electron-builder/updater |
| `better-sqlite3` | ❌ | ❌ | Already removed |
| `sqlite3` | ❌ | ❌ | Already removed |
| `hermes-parser` | ❌ (transitive only) | ❌ | Keep — Facebook parser, not Hermes product |
| any `hermes-*` product package | ❌ | ❌ | Already removed |

### Transitive dependency details

```bash
pnpm list koa @koa/router socket.io socket.io-client js-yaml js-tiktoken \
  better-sqlite3 sqlite3 hermes-parser --depth=10
```

Only matches:

- `js-yaml@4.1.1` under `electron-updater@6.8.3` and `electron-builder@26.8.1`
  and its sub-packages.
- `hermes-parser@0.25.1` / `hermes-estree@0.25.1` under
  `eslint-plugin-react-hooks@7.0.1`.

**Conclusion**: no dependency removal is required or safe to perform in this batch.
`pnpm-lock.yaml` must not be modified because the matching packages are legitimate
non-Hermes tooling dependencies.

## 3. Packaged Resource & Build Asset Audit

### Searched locations

- `resources/`
- `public/`
- `build/` (excluding `build/openclaw/` external runtime)
- `dist/` / `dist-electron/` / `release/`
- `scripts/`

### Findings

- No files named `*hermes*` in `resources/` or `public/`.
- No Hermes/Koa path fingerprints in `scripts/*`.
- `build/openclaw/dist/extensions/migrate-hermes/` is present. This is an **OpenClaw
  runtime extension** (not ClawDock source) and is intentionally preserved. It is
  used by the external `openclaw` runtime for migrating from Hermes and must not be
  deleted by this cleanup.

## 4. Source Code Path Fingerprint Audit

### Repo-wide search (excluding `node_modules`, `build`, `dist`, `.git`, worktrees)

Pattern: `hermes|hermes-web-ui|\.hermes|HERMES_WEB_UI|HERMES_DATA_DIR|HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN`

Remaining matches are limited to:

1. **Our own regression tests/specs/docs** — expected and correct.
   - `tests/unit/hermes-server-batch-*.test.ts`
   - `tests/unit/hermes-removal.test.ts`
   - `tests/e2e/hermes-removal.spec.ts`
   - `harness/specs/tasks/hermes-server-phase2-batch-*.md`
   - `harness/specs/tasks/remove-hermes-product-paths.md`
   - `docs/2026-07-21-Hermes-server-phase2-cleanup-plan.md`
   - `docs/superpowers/plans/*` (historical plan references)

2. **External documentation** — not ClawDock code.
   - `external/agency-agents-zh/README*.md` references NousResearch Hermes Agent
     `~/.hermes/skills/`. This is unrelated to the Koa Web UI cleanup.

3. **Dead server-side source files** — candidates for future cleanup.
   - `server/src/shared/providers.ts` (490 lines). Comment says "Synced from
     hermes-agent hermes_cli/models.py _PROVIDER_MODELS." No importer in
     `server/src/`, `electron/`, `src/`, or `scripts/`.
   - `server/src/lib/llm-json.ts`, `server/src/lib/llm-prompt.ts`. No importers
     anywhere in the repo.

4. **`pnpm-lock.yaml`** — only `hermes-parser` / `hermes-estree` transitive deps.

### `HERMES_*` Web UI env var audit

The three target variables are no longer set or read:

```bash
grep -RIn "HERMES_WEB_UI_HOME\|HERMES_DATA_DIR\|HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN" \
  server/src electron scripts --include='*.ts' --include='*.js'
# No results.
```

External Hermes Agent variables (`HERMES_HOME`, `HERMES_AGENT_ROOT`, `HERMES_BIN`,
`HERMES_MODEL`) are not set by ClawDock code and are intentionally preserved.

## 5. Runtime Directory Audit

### Directories observed on the audit machine

| Path | Origin | Contents | Recommended action |
|---|---|---|---|
| `~/.hermes-web-ui` | Deleted Koa Web UI `HERMES_WEB_UI_HOME` | `hermes-web-ui.db`, `.token`, `.login-lock.json`, `cache/`, `coding-agent/`, `desktop-runtime/`, `logs/`, `upload/` | **Migration candidate** — rename to ClawDock namespace or offer user cleanup after verifying no OpenClaw consumer |
| `~/Library/Application Support/ClawDock/hermes` | Electron `userData/hermes` from deleted `HERMES_*` env | `.login-lock.json`, `.token`, `data/`, `logs/`, `upload/` | **Safe to delete/migrate** after user confirmation; no code references it post-Batch D |
| `~/Library/Application Support/clawdock/hermes` | Lowercase variant of above | Same as above | Same as above |
| `~/.hermes` | External Hermes Agent home (NousResearch/OpenClaw) | 51 entries | **Do not touch** — external runtime directory |

### Repository fixture

| Path | Status | Recommended action |
|---|---|---|
| `packages/server/data/hermes-web-ui.db` | Tracked by git (143 KB) | **Delete candidate** — development fixture for the removed Koa server; verify not used by tests/docs before removal |

## 6. Proposed Reversible Disposal Plan

This plan requires explicit authorization before any step is executed.

### Step E.1 — Source-code cleanup (low risk)

- Delete `server/src/shared/providers.ts`.
- Delete `server/src/lib/llm-json.ts` and `server/src/lib/llm-prompt.ts`.
- Verify via `grep` and `pnpm run typecheck` that nothing imports them.
- Rollback: `git revert <commit>`.

### Step E.2 — Repository fixture cleanup (low risk)

- Delete `packages/server/data/hermes-web-ui.db`.
- Add `packages/server/data/*.db` to `.gitignore` if development databases should
  never be committed again.
- Rollback: restore from git history.

### Step E.3 — Runtime directory migration (medium risk, user-facing)

**Option A (recommended)**: Rename on first launch
- On app startup, if `~/.hermes-web-ui` exists and the new ClawDock directory does
  not, migrate user data to the new namespace (e.g. `~/.clawdock-legacy` or
  `~/Library/Application Support/ClawDock/legacy-hermes-web-ui`).
- Leave a marker file to avoid re-running.
- Do **not** delete the old directory automatically; offer user a cleanup button.

**Option B**: Document-only cleanup
- Add a "Legacy Hermes Web UI data detected" notice in Settings > Advanced with a
  "Reveal in Finder" / "Delete after backup" button.
- No automatic migration.

**For `~/Library/Application Support/ClawDock/hermes`**:
- Safe to delete on startup because it was only created by the removed
  `HERMES_*` env logic and is no longer referenced.
- Recommended: delete the directory on first launch after Batch D if it exists,
  with a log line.

### Step E.4 — Verification gates (must pass before any disposal)

1. `grep -RIn "HERMES_WEB_UI_HOME\|HERMES_DATA_DIR\|HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN" \
   server/src electron scripts --include='*.ts' --include='*.js'` → no results.
2. `pnpm run typecheck` (root) passes.
3. `pnpm --filter clawx-license-server run typecheck` passes.
4. `pnpm test` Hermes regression tests pass.
5. `pnpm run harness:ci` passes.
6. Clean-environment E2E smoke: launch app with temporary userData directory,
   confirm no new `<userData>/hermes` directory is created.
7. OpenClaw Gateway starts and reports healthy without `HERMES_*` Web UI env vars.

## 7. Exclusions & Stop Conditions

- **Do not** modify `pnpm-lock.yaml` or `package.json` for `hermes-parser` /
  `hermes-estree` / `js-yaml` because they are transitive deps of non-Hermes tools.
- **Do not** delete `~/.hermes` (external Hermes Agent home).
- **Do not** delete `build/openclaw/dist/extensions/migrate-hermes/` (external
  OpenClaw runtime extension).
- **Do not** modify user directories without explicit user-facing migration plan
  and approval.
- Stop immediately if any production code is found that still reads the three
  `HERMES_*` Web UI env vars or writes to the legacy directories.

## 8. Audit Conclusion

Batch A/B/C/D successfully removed all Koa/Hermes Web UI source code. Batch E audit
confirms that the remaining Hermes fingerprints are:

1. Benign tooling transitive dependencies.
2. External OpenClaw runtime artifacts.
3. Our own regression tests/docs.
4. Unused server-side dead code.
5. Legacy user-data directories and one repository fixture.

No urgent deletion is required. The proposed Step E.1–E.4 disposal plan is reversible
and can be executed in future authorized batches.
