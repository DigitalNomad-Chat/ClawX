---
id: chat-runtime-event-dual-emit-m0
title: Main dual-emit normalized chat runtime events (M0 only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Introduce Main-owned ChatRuntimeEvent contract, normalize OpenClaw agent stream payloads, dual-emit chat:runtime-event alongside the existing gateway notification path, and declare tool-events capability — without switching renderer consumption.
touchedAreas:
  - harness/specs/tasks/chat-runtime-event-dual-emit-m0.md
  - shared/chat-runtime-events.ts
  - electron/gateway/chat-runtime-events.ts
  - electron/gateway/event-dispatch.ts
  - electron/gateway/ws-client.ts
  - electron/gateway/manager.ts
  - electron/main/index.ts
  - electron/main/ipc-handlers.ts
  - tests/unit/gateway-event-dispatch.test.ts
  - tests/unit/chat-runtime-events-normalize.test.ts
expectedUserBehavior:
  - Existing chat notification / handleChatEvent / history poll paths continue to work unchanged.
  - Main normalizes supported agent stream payloads into a stable ChatRuntimeEvent contract.
  - Unsupported or malformed agent payloads do not crash dispatch and still emit legacy notifications when on the agent path.
  - Gateway connect declares tool-events so OpenClaw can stream tool lifecycle events to Main.
  - Renderer does not yet subscribe to chat:runtime-event (M1+).
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
  - tests/unit/gateway-event-dispatch.test.ts
  - tests/unit/chat-runtime-events-normalize.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Task stays within M0 Main dual-emit skeleton; no preload/host-events/store/UI runtime consumption.
  - Agent path dual-emits chat:runtime-event when normalization succeeds and always keeps notification.
  - lifecycle phase=end is not normalized as run.ended (ClawDock non-terminal semantics preserved).
  - Unknown/malformed agent payloads return null from normalize and do not emit chat:runtime-event.
  - Main WS connect frame declares caps including tool-events.
  - No v0.4.9 host-contract / api→services / tsconfig-vite global refactor is required.
docs:
  required: false
---
