---
id: chat-runtime-event-transport-m1
title: Expose chat runtime event renderer transport mapping (M1 only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make chat:runtime-event reachable via preload allowlist and host-events mapping so subscribeHostEvent can receive Main dual-emit, without switching renderer chat consumption off the legacy notification path.
touchedAreas:
  - harness/specs/tasks/chat-runtime-event-transport-m1.md
  - electron/preload/index.ts
  - src/lib/host-events.ts
  - tests/unit/host-events.test.ts
expectedUserBehavior:
  - subscribeHostEvent('chat:runtime-event') maps to the chat:runtime-event IPC channel.
  - Preload on/once allowlists accept chat:runtime-event without Invalid IPC channel errors.
  - Existing gateway:notification, history poll, image settle, stale send, and New Chat paths remain unchanged.
  - Renderer does not yet process ChatRuntimeEvent for UI or store runtime graph (M2+).
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
  - tests/unit/host-events.test.ts
  - tests/unit/gateway-event-dispatch.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Task stays within M1 transport mapping; no gateway/chat store or Chat UI runtime consumption.
  - HOST_EVENT_TO_IPC_CHANNEL includes chat:runtime-event -> chat:runtime-event.
  - Preload validChannels for on and once include chat:runtime-event.
  - Legacy notification dual-path and phase=end semantics are not modified.
  - No v0.4.9 host-contract / api→services / tsconfig-vite global refactor is required.
docs:
  required: false
---
