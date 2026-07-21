---
id: remove-hermes-product-paths
title: Remove Hermes product paths from renderer, main, i18n, docs, and tests
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Completely remove Hermes product paths from the desktop app surface. This
  includes Setup runtime checks, Settings developer UI, host-api/app surface,
  IPC/preload whitelist, HTTP routes, translation copy, user-facing docs, and
  tests. Preserve OpenClaw shared infrastructure (Gateway, host-api, logs,
  shell, dialog, settings, cron, etc.). Server-side source/db/config audit is
  out of scope for this phase.
touchedAreas:
  - harness/specs/tasks/remove-hermes-product-paths.md
  - src/pages/Setup/index.tsx
  - src/pages/Settings/index.tsx
  - src/lib/host-api.ts
  - src/lib/host-api-client.ts
  - src/i18n/locales/*/setup.json
  - src/i18n/locales/*/settings.json
  - src/i18n/locales/*/chat.json
  - src/i18n/locales/*/dreams.json
  - src/i18n/locales/*/common.json
  - src/i18n/locales/*/cron.json
  - src/i18n/locales/*/skills.json
  - src/i18n/locales/*/channels.json
  - electron/services/app-api.ts
  - electron/api/routes/app.ts
  - electron/preload/index.ts
  - electron/main/ipc-handlers.ts
  - docs/Hermes版
  - tests/unit/hermes-removal.test.ts
  - tests/e2e/hermes-removal.spec.ts
expectedUserBehavior:
  - Setup runtime check only verifies Node.js and Gateway.
  - Settings developer section no longer shows a Hermes CLI install prompt.
  - No user-facing copy references Hermes; product is referred to as OpenClaw.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - tests/unit/hermes-removal.test.ts
  - tests/e2e/hermes-removal.spec.ts
acceptance:
  - Hermes status action and route are gone from hostApi.app.
  - Setup page has no Hermes row and translations contain no "Hermes"/"hermes".
  - Hermes CLI install UI removed from Settings.
  - Docs/Hermes版 directory removed.
  - Pre-existing unrelated test failures remain documented.
docs:
  required: true
---

# Remove Hermes product paths

## In scope
- Renderer Setup and Settings UI.
- host-api app surface (`openClawDoctor` only).
- Main app-api service and `/api/app/*` routes.
- i18n copy replacement (Hermes → OpenClaw).
- `docs/Hermes版` removal.
- Regression tests for absence of Hermes paths.

## Out of scope
- Server-side Hermes source/db/config/dependency/resource audit (phase 2).
- M4/chat/media/proxy changes.
- Renaming internal `HERMES_*` env vars still consumed by the OpenClaw server.
