---
id: fix-gateway-client-rpc-mapping-2026.6.6
title: Fix GatewayClient RPC method mapping for OpenClaw 2026.6.6
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Align the legacy GatewayClient method names with the real OpenClaw 2026.6.6 Gateway RPC surface, mapping compatible methods and explicitly rejecting removed/incompatible ones.
touchedAreas:
  - harness/specs/tasks/fix-gateway-client-rpc-mapping-2026.6.6.md
  - electron/gateway/client.ts
  - electron/gateway/rpc-method-map.ts
  - tests/unit/gateway-client-rpc-mapping.test.ts
  - tests/unit/gateway-client-rpc-regression.test.ts
expectedUserBehavior:
  - Any remaining caller of GatewayClient uses method names that are valid against OpenClaw 2026.6.6.
  - Removed or shape-incompatible GatewayClient methods fail immediately with a typed UnsupportedGatewayMethodError instead of failing later as a Gateway METHOD_NOT_FOUND.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - gateway-readiness-policy
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm exec vitest run tests/unit/gateway-client-rpc-mapping.test.ts
  - pnpm exec vitest run tests/unit/gateway-client-rpc-regression.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - GatewayClient calls resolveGatewayClientMethod before every RPC.
  - Compatible legacy methods map to OpenClaw 2026.6.6 advertised methods (e.g. system.health -> health, system.config -> config.get, providers.list -> models.list).
  - Removed or incompatible methods throw UnsupportedGatewayMethodError and are never sent over the wire.
  - Renderer and Main do not add new direct IPC or direct Gateway HTTP calls.
  - Comms replay and compare pass without regression.
docs:
  required: false
---
