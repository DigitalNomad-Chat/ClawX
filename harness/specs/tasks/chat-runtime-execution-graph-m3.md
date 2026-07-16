---
id: chat-runtime-execution-graph-m3
title: Prefer runtimeRuns for active Execution Graph (M3 only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Drive the active-session Execution Graph from M2 runtimeRuns when tool activity is present, while keeping history-derived task-visualization as the full fallback for historical sessions and notification-only runs.
touchedAreas:
  - harness/specs/tasks/chat-runtime-execution-graph-m3.md
  - src/pages/Chat/task-visualization.ts
  - src/pages/Chat/index.tsx
  - src/stores/chat.ts
  - tests/unit/task-visualization.test.ts
  - tests/unit/chat-page-execution-graph.test.tsx
  - tests/e2e/chat-run-state-events.spec.ts
expectedUserBehavior:
  - Active run with runtime tool events shows those tools inside the Execution Graph card.
  - Foreign/stale runtime runIds never appear in the active graph.
  - Historical sessions without runtimeRuns continue to show history-derived tool graphs.
  - run.ended / completed tools do not leave forever-loading tool steps.
  - Legacy notification phase=end stop-control behavior remains covered by existing E2E.
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
  - tests/unit/task-visualization.test.ts
  - tests/unit/chat-page-execution-graph.test.tsx
  - tests/unit/chat-runtime-graph.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
  - tests/e2e/chat-task-visualizer.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Task stays within M3 UI active-graph source switch; M2 dual-track store and history poll remain.
  - No M4 history poll removal or notification path deletion.
  - No v0.4.9 host-contract / provider / transport refactor.
  - Real provider Gateway live smoke is external and must not be claimed as passed without evidence.
docs:
  required: false
---
