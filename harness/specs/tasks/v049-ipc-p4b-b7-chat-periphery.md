---
id: v049-ipc-p4b-b7-chat-periphery
title: v0.4.9 P4b-B7 Chat page periphery hostApi facade
cenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Migrate the Chat page directory-attachment onOpen handler from legacy
  invokeIpc('shell:openPath') to the existing hostApi.shell.openPath facade.
  Keep all chat history/sessions HTTP paths, gateway:rpc, provider/settings
  list reads, FileCard collaboration fallback, and send/M4 paths unchanged.
  Legacy shell:openPath IPC handler remains registered for fallback.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b7-chat-periphery.md
  - src/pages/Chat/index.tsx
  - tests/unit/p4b-b7-chat-periphery.test.ts
  - tests/e2e/p4b-b7-chat-periphery.spec.ts
expectedUserBehavior:
  - Clicking a directory attachment in a chat message opens the folder via hostApi.shell.openPath.
  - Non-directory attachments still open the in-app preview panel.
  - Chat history load, sessions list, provider/settings reads, send path, and M4 behavior unchanged.
  - Legacy shell:openPath handler is still available as fallback.
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
  - tests/unit/p4b-b7-chat-periphery.test.ts
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/chat-history-poll.test.ts
  - tests/unit/chat-send-stale.test.ts
  - tests/unit/chat-new-session-run-cache.test.ts
  - tests/unit/image-generation-status.test.ts
  - tests/e2e/p4b-b7-chat-periphery.spec.ts
  - pnpm run harness:ci
acceptance:
  - Chat/index.tsx uses hostApi.shell.openPath and contains no invokeIpc('shell:openPath').
  - No chat/sessions/media host module or stub is added.
  - No changes to chat:sendWithMedia, runtimeRuns, history-poll, dual-emit, 180s timeout, gateway control, v0.4.10.
  - M4 gate tests all pass.
  - E2E verifies host:invoke shell.openPath path in Chat context.
docs:
  required: false
---

# v0.4.9 P4b-B7 — Chat page periphery facade

## In scope
- `hostApi.shell.openPath` for Chat page directory attachment onOpen.

## Out of scope
- Chat history/sessions HTTP paths (`/api/sessions/*`, `/api/files/thumbnails`).
- `gateway:rpc` history/sessions calls.
- Provider/settings list reads (no existing facade).
- `FileCard` default fallback used by collaboration module.
- Chat send path, runtime events, history-poll, M4.
- Legacy channel deletion.
