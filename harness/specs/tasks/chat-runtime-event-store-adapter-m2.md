---
id: chat-runtime-event-store-adapter-m2
title: Dual-track chat runtime event store adapter (M2 only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Subscribe to Main-normalized chat:runtime-event in the gateway store and maintain runtimeRuns via a pure runtime graph reducer, while keeping legacy agent notification handleChatEvent and history poll dual-track behavior intact.
touchedAreas:
  - harness/specs/tasks/chat-runtime-event-store-adapter-m2.md
  - src/stores/chat/runtime-graph.ts
  - src/stores/chat/types.ts
  - src/stores/chat/store-api.ts
  - src/stores/chat.ts
  - src/stores/gateway.ts
  - tests/unit/chat-runtime-graph.test.ts
  - tests/unit/gateway-events.test.ts
expectedUserBehavior:
  - Runtime events update runtimeRuns without requiring UI Execution Graph source switch (M3).
  - Legacy gateway:notification agent path continues to drive handleChatEvent and phase=end non-terminal semantics.
  - Image settle, stale send, and New Chat session run cache behaviors remain unchanged.
  - Same runtime event does not double-append into runtimeRuns events (runId+seq / fingerprint dedupe).
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - host-events-fallback-policy
  - gateway-readiness-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/chat-runtime-graph.test.ts
  - tests/unit/gateway-events.test.ts
  - tests/unit/chat-send-stale.test.ts
  - tests/unit/chat-new-session-run-cache.test.ts
  - tests/unit/image-generation-status.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Task stays within M2 store adapter; no Execution Graph UI priority switch (M3).
  - gateway store subscribes to chat:runtime-event and still subscribes to gateway:notification.
  - chat store exposes handleRuntimeEvent and runtimeRuns; handleChatEvent remains.
  - run.ended does not clear sending for non-matching runs or session-less stale terminals.
  - No v0.4.9 host-contract / api→services / tsconfig-vite global refactor is required.
docs:
  required: false
---
