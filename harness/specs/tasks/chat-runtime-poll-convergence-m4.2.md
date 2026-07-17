---
id: chat-runtime-poll-convergence-m4.2
title: Restricted history poll convergence (M4.2)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Enable POLL_CONVERGENCE_ENABLED after live item→tool dual-emit evidence, so happy-path
  history poll may skip only when every gate passes: convergence flag, live provider
  tool-chain evidence latch, matching session+activeRunId, run status running, fresh
  runtime tool activity, and not pendingFinal. All other cases keep loadHistory(true).
  Never remove legacy notification, phase=end non-terminal, image settle, stale send,
  or New Chat run-cache semantics.
touchedAreas:
  - harness/specs/tasks/chat-runtime-poll-convergence-m4.2.md
  - src/stores/chat/runtime-evidence.ts
  - src/stores/chat/runtime-pipeline.ts
  - src/stores/chat/history-poll.ts
  - src/stores/chat.ts
  - src/stores/chat/runtime-send-actions.ts
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/chat-history-poll.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
expectedUserBehavior:
  - With full gates (flag+live evidence+active running run+session match+fresh tool activity+not pendingFinal), mid-run poll ticks may skip loadHistory.
  - Missing any gate falls back to loadHistory(true) — including silence expiry path after silence window, terminal runs, foreign session, no tools, pendingFinal, stale activity.
  - phase=end never clears stop via run.ended; legacy notification path unchanged.
  - Image settle / stale send / New Chat session run-cache behaviors unchanged.
  - POLL_CONVERGENCE_ENABLED is true but skip remains impossible without live evidence latch.
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
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/chat-history-poll.test.ts
  - tests/unit/chat-runtime-graph.test.ts
  - tests/unit/chat-send-stale.test.ts
  - tests/unit/chat-new-session-run-cache.test.ts
  - tests/unit/image-generation-status.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Restricted skip only; fallback loadHistory retained for all uncertainty paths.
  - No deletion of gateway notification dual-emit or phase=end non-terminal.
  - Live provider evidence latch set from real tool-like runtime events; tests can override.
  - No v0.4.9 host-contract / provider / transport refactor.
  - harness:ci pre-existing AgentChat debt is listed separately if it fails.
docs:
  required: false
---
