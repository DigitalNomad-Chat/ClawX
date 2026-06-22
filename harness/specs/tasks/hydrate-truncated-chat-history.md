---
id: hydrate-truncated-chat-history
title: Hydrate truncated chat history from session transcript fallback
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: When gateway chat.history returns truncated message content, transparently hydrate the full text from the host API transcript endpoint and local store without losing local metadata.
touchedAreas:
  - harness/specs/tasks/hydrate-truncated-chat-history.md
  - src/stores/chat/history-rpc-params.ts
  - src/stores/chat/history-transcript-fallback.ts
  - src/stores/chat/history-transcript-merge.ts
  - src/stores/chat/history-transcript-hydrate.ts
  - src/stores/chat/history-actions.ts
  - src/stores/chat.ts
  - tests/unit/history-rpc-params.test.ts
  - tests/unit/history-transcript-fallback.test.ts
  - tests/unit/history-transcript-merge.test.ts
  - tests/unit/history-transcript-hydrate.test.ts
  - tests/unit/chat-history-actions.test.ts
  - tests/unit/chat-store-history-retry.test.ts
  - tests/unit/chat-target-routing.test.ts
expectedUserBehavior:
  - Long chat histories load without missing message text caused by gateway truncation.
  - Attachments and local-only metadata on truncated messages are preserved after hydration.
  - History reload gracefully falls back to local messages when the transcript endpoint is unavailable.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - gateway-readiness-policy
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
requiredTests:
  - tests/unit/history-rpc-params.test.ts
  - tests/unit/history-transcript-fallback.test.ts
  - tests/unit/history-transcript-merge.test.ts
  - tests/unit/history-transcript-hydrate.test.ts
  - tests/unit/chat-history-actions.test.ts
  - tests/unit/chat-store-history-retry.test.ts
  - tests/unit/chat-target-routing.test.ts
acceptance:
  - chat.history RPC includes a bounded maxChars parameter (default 500_000).
  - Truncated gateway messages are detected and hydrated from /api/sessions/transcript.
  - Hydration preserves message identity matching by id or index.
  - Local-only fields (_attachedFiles, _desensitizeMap) survive hydration.
  - Transcript fallback failures do not crash history loading.
  - Renderer does not call Gateway HTTP directly.
docs:
  required: false
---
