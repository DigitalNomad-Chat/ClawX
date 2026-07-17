---
id: v049-ipc-p4a-renderer-hostapi-facade
title: v0.4.9 P4a renderer hostApi facade and low-risk migration
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Add a typed renderer hostApi facade over host:invoke for low-risk P3a
  surfaces (app.openClawDoctor, openclaw.status, usage.recentTokenHistory)
  with hostApiFetch/legacy IPC fallback. Migrate Models usage history only.
  Do not migrate skills config, provider keys, channels writes, chat/sessions/media/M4.
  Do not delete legacy paths.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p4a-renderer-hostapi-facade.md
  - src/lib/host-api-client.ts
  - src/lib/host-api.ts
  - src/lib/usage-history-entries.ts
  - src/pages/Models/index.tsx
  - src/pages/Models/usage-history.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/usage-history-entries.test.ts
  - tests/e2e/p4a-host-api-facade.spec.ts
  - tests/e2e/p4a-models-usage-facade.spec.ts
expectedUserBehavior:
  - Models token usage history still loads via dual-path facade.
  - hostInvoke preferred when available; fetch/IPC fallback retained.
  - providers.getApiKey remains UNSUPPORTED on host:invoke; no skill/channel writes via facade.
  - Transport fallback uses explicit error codes only (never message heuristics).
  - Models page UI shows usage for hostInvoke success and UNSUPPORTED→HTTP fallback.
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
  - tests/unit/host-api.test.ts
  - tests/e2e/p4a-host-api-facade.spec.ts
  - tests/e2e/p4a-models-usage-facade.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Facade limited to app/openclaw/usage low-risk actions.
  - hostApiFetch export retained for all other call sites.
  - No P4b skills/providers/channels/chat migration; no legacy deletion.
  - Fallback only on explicit transport codes (UNSUPPORTED/BRIDGE/CHANNEL_UNAVAILABLE).
docs:
  required: false
---

# v0.4.9 P4a — Renderer hostApi facade (minimal)

## In scope
- `invokeHost` + `hostApi.{app,openclaw,usage}`
- Models `usage.recentTokenHistory` migration
- Fallbacks: hostapi:fetch / openclaw:status IPC

## Out of scope
skills config, provider keys, channels write, chat/sessions/media, M4, prune legacy
