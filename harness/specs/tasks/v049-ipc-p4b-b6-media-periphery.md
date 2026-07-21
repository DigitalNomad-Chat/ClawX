---
id: v049-ipc-p4b-b6-media-periphery
title: v0.4.9 P4b-B6 ChatInput attachment / media preview hostApi facade
cenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Migrate ChatInput attachment file picker and chat message image preview
  "show in folder" calls from legacy invokeIpc to the existing hostApi facade
  (dialog.open / shell.showItemInFolder). Legacy dialog:* and shell:* IPC
  handlers remain registered for fallback. Do not touch chat:sendWithMedia,
  send pipeline, runtimeRuns, history-poll, dual-emit, 180s timeout,
  gateway/auth/providers/channels/updates/v0.4.10, or rw-workspace configuration.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4b-b6-media-periphery.md
  - src/pages/Chat/ChatInput.tsx
  - src/components/chat-message-parts/ImageParts.tsx
  - tests/unit/chat-input.test.tsx
  - tests/unit/p4b-b6-image-parts-hostapi.test.tsx
  - tests/e2e/p4b-b6-media-periphery.spec.ts
expectedUserBehavior:
  - Clicking the ChatInput paperclip opens the native file dialog via hostApi.dialog.open.
  - Image lightbox "show in folder" button reveals the file via hostApi.shell.showItemInFolder.
  - Legacy dialog:open and shell:showItemInFolder handlers remain available as fallback.
  - chat:sendWithMedia, runtime event pipeline, history-poll, and rw-workspace are unchanged.
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
  - tests/unit/chat-input.test.tsx
  - tests/unit/p4b-b6-image-parts-hostapi.test.tsx
  - tests/unit/image-generation-status.test.ts
  - tests/e2e/p4b-b6-media-periphery.spec.ts
acceptance:
  - ChatInput attachment picker uses hostApi.dialog.open with multi-selection.
  - ImageParts lightbox uses hostApi.shell.showItemInFolder.
  - No legacy invokeIpc('dialog:open') / invokeIpc('shell:showItemInFolder') remain in touched files.
  - Unit tests cover both migrated call sites.
  - E2E exercises host:invoke path for dialog/shell in Chat/media context.
  - M4 unit tests still pass; no send-pipeline coupling introduced.
docs:
  required: false
---

# v0.4.9 P4b-B6 — ChatInput attachment / media preview facade

## In scope
- `hostApi.dialog.open` for ChatInput file attachment picker.
- `hostApi.shell.showItemInFolder` for chat message image lightbox reveal.

## Out of scope
- `chat:sendWithMedia`, send pipeline, runtimeRuns, history-poll, dual-emit.
- `rw-workspace:*` configuration and its directory picker.
- `gateway:status`, providers, channels, updates, v0.4.10.
- Deleting legacy IPC handlers.
