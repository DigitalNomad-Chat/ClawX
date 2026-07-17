---
id: chat-runtime-item-tool-compat
title: Map OpenClaw stream=item kind=tool to ChatRuntimeEvent tool lifecycle (compat)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  OpenClaw 2026.5.x dual-emits stream=tool (recipient-gated) and stream=item
  (broadcast). Map item kind=tool start/update/end into tool.started/updated/completed
  so dual-emit chat:runtime-event covers tools when stream=tool is filtered, while
  keeping legacy agent notification, phase=end non-terminal, and POLL_CONVERGENCE_ENABLED=false.
touchedAreas:
  - harness/specs/tasks/chat-runtime-item-tool-compat.md
  - electron/gateway/chat-runtime-events.ts
  - electron/gateway/event-dispatch.ts
  - src/stores/chat/runtime-graph.ts
  - tests/unit/chat-runtime-events-normalize.test.ts
  - tests/unit/gateway-event-dispatch.test.ts
  - tests/unit/chat-runtime-graph.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
expectedUserBehavior:
  - item kind=tool start/update/end normalize to tool.started/updated/completed and dual-emit with notification.
  - item kind=command/patch and incomplete items stay notification-only.
  - lifecycle phase=end remains non-terminal (not run.ended).
  - runtimeRuns does not double-append tool lifecycle for same toolCallId when both stream=tool and stream=item map to tool.*.
  - Active Execution Graph shows tool steps when only item-derived runtime events arrive.
  - M4 poll convergence stays off; history poll / image settle / stale send / New Chat unchanged.
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
  - tests/unit/chat-runtime-events-normalize.test.ts
  - tests/unit/gateway-event-dispatch.test.ts
  - tests/unit/chat-runtime-graph.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
  - tests/e2e/chat-run-state-events.spec.ts
acceptance:
  - No v0.4.9 host-contract / api→services refactor.
  - No M4.2 poll convergence (POLL_CONVERGENCE_ENABLED remains false).
  - Legacy agent notification path always retained on dual-emit.
  - Does not map kind=command/patch items to tool.* (command_output / patch streams remain authoritative).
docs:
  required: false
---
