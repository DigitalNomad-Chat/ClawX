---
id: v049-ipc-p1-agentchat-boundary
title: v0.4.9 P1 AgentChat direct IPC boundary fix
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Remove direct window.electron.ipcRenderer.invoke/on usage from AgentChat page
  by routing kernel/marketplace/kernel-llm calls through src/lib (invokeIpc +
  subscribeHostEvent). Preserve channel names, args, return/error/loading
  behavior. No hostInvoke enablement, no host-api-proxy/M4/v0.4.10 changes.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p1-agentchat-boundary.md
  - src/lib/kernel-bridge.ts
  - src/lib/host-events.ts
  - src/pages/AgentChat/index.tsx
  - tests/unit/agentchat-ipc-boundary.test.ts
  - tests/unit/kernel-bridge.test.ts
  - tests/unit/host-events.test.ts
  - tests/e2e/agentchat-ipc-boundary.spec.ts
expectedUserBehavior:
  - AgentChat loads agent info, provider check, hire, subscribe, approval, and send paths with equivalent success/error/loading UI.
  - kernel:event stream still reaches AgentChat after subscribeHostEvent mapping.
  - No page-level window.electron.ipcRenderer.invoke/on remains in AgentChat/index.tsx.
  - hostapi:fetch proxy, #1094 M4 runtime/poll, and Chat page paths remain unchanged.
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
  - tests/unit/agentchat-ipc-boundary.test.ts
  - tests/unit/kernel-bridge.test.ts
  - tests/unit/host-events.test.ts
  - tests/e2e/agentchat-ipc-boundary.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - AgentChat page has zero direct ipcRenderer.invoke/on string matches.
  - kernel-bridge uses invokeIpc for marketplace/kernel/kernel-llm channels used by AgentChat.
  - host-events maps kernel:event to IPC channel kernel:event (preload allowlist authority, not P0 HOST_EVENT_CHANNELS).
  - Electron E2E covers AgentChat init via mocked Main handlers and asserts ready UI.
  - No P2 hostInvoke registry, shared contract migration, host-api-proxy, M4, or v0.4.10 provider changes.
docs:
  required: false
---

# v0.4.9 P1 — AgentChat IPC boundary

## Scope

- **In:** page boundary fix, thin `kernel-bridge`, `kernel:event` host-events map, unit + E2E.
- **Out:** hostInvoke, api→services, host-api-proxy, M4 runtime/poll, v0.4.10, skills marketplace product changes, full kernel-client rewrite.

## Authority for channels

Use existing preload `validChannels` / Main handlers. Do **not** treat P0 `HOST_EVENT_CHANNELS` as the event channel authority.
