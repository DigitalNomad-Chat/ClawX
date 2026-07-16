---
id: chat-runtime-evidence-scaffold-m4.1
title: Runtime evidence and poll-gate scaffold (M4.1 only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Extract testable runtime freshness and tool-activity predicates, document M4.2 poll-convergence thresholds and rollback boundaries, and wire a no-op poll observation hook without changing happy-path history poll cadence or legacy notification behavior. Review-fix keep a single run-scoped activity authority, normalize timestamps to ms, and hard-require live provider tool-chain evidence for any future skip-allowed path.
touchedAreas:
  - harness/specs/tasks/chat-runtime-evidence-scaffold-m4.1.md
  - src/stores/chat/runtime-evidence.ts
  - src/stores/chat/runtime-pipeline.ts
  - src/stores/chat/helpers.ts
  - src/stores/chat.ts
  - src/pages/Chat/task-visualization.ts
  - tests/unit/chat-runtime-evidence.test.ts
  - tests/unit/task-visualization.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
expectedUserBehavior:
  - History poll timing remains identical to M3 (no skip / no slowdown) while POLL_CONVERGENCE_ENABLED is false.
  - Legacy gateway:notification phase=end still does not clear stop control.
  - Active runtime Execution Graph behavior from M3 remains available when runtime tool events are present.
  - Runtime evidence helpers can report fresh+tool-activity without requiring UI changes.
  - Foreign session/run activity cannot satisfy freshness for the active run; second-scale event.ts is normalized to ms.
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
  - tests/unit/task-visualization.test.ts
  - tests/unit/chat-runtime-graph.test.ts
  - tests/e2e/chat-run-state-events.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - POLL_CONVERGENCE_ENABLED remains false; shouldSkipHistoryPollForRuntimeEvidence never true under production defaults.
  - Single run-scoped activity authority in runtime-evidence (no dual lastRuntimeEventAt in helpers/chat).
  - requireLiveProviderToolChainEvidence is a hard gate for skip-allowed (reason no-live-provider-evidence when missing).
  - No deletion or narrowing of legacy notification lifecycle (phase=end non-terminal preserved).
  - No changes to image settle, stale send, or New Chat session run-cache semantics.
  - M4.2 thresholds and rollback boundaries are declared in code (runtime-evidence.ts) for lead review.
  - No v0.4.9 host-contract / provider / transport refactor.
  - Live full provider tool-chain evidence remains external; this task does not claim it.
docs:
  required: false
---
