---
id: v049-ipc-p4b-b1-window-shell-dialog
title: v0.4.9 P4b-B1 window/shell/dialog renderer hostApi facade
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Extend renderer hostApi facade for window, shell, and dialog modules already
  registered on Main HostApiRegistry. Migrate TitleBar and file-preview low-risk
  call sites to hostApi with legacy window:*/shell:*/dialog:* IPC fallback.
  Do not migrate settings, cron, chat/sessions/media, provider keys, gateway
  transport, or M4. Do not delete legacy handlers.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b1-window-shell-dialog.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/components/layout/TitleBar.tsx
  - src/components/file-preview/open-file-utils.ts
  - src/components/file-preview/WorkspaceBrowserBody.tsx
  - src/components/file-preview/FilePreviewBody.tsx
  - src/components/file-preview/ArtifactPanel.tsx
  - src/components/file-preview/GeneratedFilesPanel.tsx
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/p4b-b1-window-shell-dialog.spec.ts
expectedUserBehavior:
  - TitleBar window controls use hostApi.window (host:invoke preferred).
  - File preview reveal/open uses hostApi.shell / hostApi.dialog.message.
  - Legacy window:*/shell:*/dialog:* IPC remains registered for fallback.
  - settings/cron/chat/sessions/media/providers/gateway are not migrated.
  - Transport fallback uses explicit codes only (UNSUPPORTED/BRIDGE/CHANNEL_UNAVAILABLE).
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - host-events-fallback-policy
  - gateway-readiness-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/p4b-b1-window-shell-dialog.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade exposes window/shell/dialog alongside existing app/openclaw/usage.
  - hostApiFetch and legacy IPC channels retained (no prune).
  - No settings/cron/chat/sessions/media/provider keys/gateway transport/M4 changes.
  - Unit covers host success + UNSUPPORTED→legacy IPC for shell/window/dialog.
  - E2E covers host:invoke window/shell/dialog path and TitleBar UI hook.
docs:
  required: false
---

# v0.4.9 P4b-B1 — window / shell / dialog facade

## In scope
- `hostApi.window|shell|dialog` + `invokeHost` FALLBACKS to legacy IPC
- TitleBar + file-preview low-risk call sites

## Out of scope
settings, cron, chat send/history, sessions, media upload, provider keys,
gateway control, M4 runtime, legacy channel deletion
