---
id: v049-ipc-p0-shared-contracts
title: v0.4.9 P0 shared host-api contracts and @shared alias (scaffold only)
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Freeze the v0.4.9 P0 baseline by adding a compile-safe shared Host API / Host
  Events contract scaffold and @shared path alias only. No runtime behavior
  change — no call-site migration, no hostInvoke, no IPC/HTTP switch, no
  host-api-proxy or #1094 M4 runtime/poll changes.
touchedAreas:
  - harness/specs/tasks/v049-ipc-p0-shared-contracts.md
  - shared/host-api/contract.ts
  - shared/host-api/types.ts
  - shared/host-events/contract.ts
  - tests/unit/host-api-contract-smoke.test.ts
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts
  - vitest.config.ts
expectedUserBehavior:
  - App runtime IPC, Host API proxy (hostapi:fetch/token), and Gateway transport behave exactly as before.
  - Renderer pages/stores do not switch to hostInvoke or new hostApi facade.
  - #1094 M4 dual-emit, restricted history poll, image settle, stale send, and New Chat paths remain untouched.
  - Developers can import types from @shared/host-api/* and @shared/host-events/* in new unit tests only.
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
  - tests/unit/host-api-contract-smoke.test.ts
  - tests/unit/host-events.test.ts
  - tests/unit/chat-runtime-events-normalize.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Task stays within P0 scaffold; zero call-site migration and zero hostInvoke enablement.
  - HostApiContract declares core modules including gateway, chat, sessions, media (and remaining scaffold modules).
  - Host events contract includes chat:runtime-event channel mapping.
  - @shared/* resolves via tsconfig paths and vite/vitest aliases.
  - host-api-proxy, ipc-handlers registration, preload, chat runtime/poll, image/stale/NewChat, v0.4.10, and skills marketplace are not modified.
  - Behavior is equivalent to pre-P0 for all user-visible and transport paths.
docs:
  required: false
---

# v0.4.9 P0 — Shared contracts + `@shared` alias

## Scope

- **In:** type-only shared contracts, path aliases, harness task, contract smoke unit test.
- **Out:** hostInvoke, host-api-proxy changes, AgentChat, chat store/runtime, routes→services, v0.4.10, skills marketplace.
- **Note:** P0 does **not** introduce `tsconfig.web.json`; `@shared/*` is added to existing `tsconfig.json` / `tsconfig.node.json` only.

## Baseline freeze notes (inventory snapshot)

Captured against `feat/membership-system-merge-v0.4.8` at P0 start (function HEAD includes M4.2 `ced5c587`).

Must remain present after P0 (unchanged):

| Surface | Examples |
|---------|----------|
| Host API proxy | `hostapi:token`, `hostapi:fetch` (`electron/main/ipc/host-api-proxy.ts`) |
| Runtime events | preload/`host-events` map `chat:runtime-event` |
| Gateway | `gateway:rpc`, `gateway:httpProxy`, status/start/stop |
| Chat media | `chat:sendWithMedia` (180s timeout) |
| ClawDock | `clawdock:*` channels, member auth handlers |

## Upstream reference

- Selective adapter from `581981f2` (#1102) shared contracts — **scaffold subset only**, not full cherry-pick.

## No runtime behavior change

P0 must not alter dispatch, proxy, transport policy, or renderer consumption. Contract files are types + constants only.
