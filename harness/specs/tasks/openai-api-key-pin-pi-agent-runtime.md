---
id: openai-api-key-pin-pi-agent-runtime
title: Pin the embedded "pi" agent runtime on OpenAI API-key provider entries to avoid the unbundled "codex" harness
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Stop OpenClaw from auto-routing OpenAI provider entries (api.openai.com baseUrl) to the externally-bundled "codex" agent harness, which is not registered in the shipped OpenClaw distribution and causes every chat to fail with `Requested agent harness "codex" is not registered.`. Pin `agentRuntime.id = "pi"` on every `models.providers.openai` and `models.providers.openai-codex` entry ClawX writes, and self-heal existing on-disk entries before the next default-provider switch and during config sanitization so upgrading users do not have to re-save their provider manually.
touchedAreas:
  - harness/specs/tasks/openai-api-key-pin-pi-agent-runtime.md
  - electron/utils/openclaw-auth.ts
  - electron/services/providers/provider-runtime-sync.ts
  - tests/unit/openclaw-auth.test.ts
expectedUserBehavior:
  - Configuring OpenAI with an API key (default `https://api.openai.com/v1` baseUrl) and starting a chat succeeds without `Requested agent harness "codex" is not registered.` from the Gateway.
  - Upgrading from an earlier ClawX build that wrote an `openai` (or `openai-codex`) provider entry without `agentRuntime` and then switching default provider (or back to OpenAI) self-heals the entry so the next Gateway reload boots cleanly.
  - OAuth-based OpenAI Codex accounts (`models.providers.openai-codex`) are also pinned to the `pi` runtime so they do not fall into the unbundled `codex` harness.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - active-config-guards
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
requiredTests:
  - tests/unit/openclaw-auth.test.ts
acceptance:
  - electron/utils/openclaw-auth.ts exports `ensureOpenClawProviderAgentRuntimePins` and pins `agentRuntime: { id: 'pi' }` on every `models.providers.openai` (and `models.providers.openai-codex`) write via `upsertOpenClawProviderEntry`.
  - electron/services/providers/provider-runtime-sync.ts invokes `ensureOpenClawProviderAgentRuntimePins` inside `syncDefaultProviderToRuntime` right after `pruneInvalidApiProviderEntries`, before either the OAuth or non-OAuth branch runs, so a switch to any healthy provider repairs legacy openai / openai-codex entries.
  - The pin policy targets both the `openai` API-key provider key and the `openai-codex` OAuth runtime key.
  - A pre-existing user-supplied `agentRuntime.id` on the `openai` or `openai-codex` entry is preserved on both the write path and the self-heal path — the pin only fills in a missing value.
  - `sanitizeOpenClawConfig` also applies the pin policy after anthropic-messages maxTokens healing, so Gateway launch repairs any legacy on-disk entries regardless of provider switching.
  - Renderer does not add new direct ipcRenderer or Gateway HTTP calls.
  - Unit tests cover (a) the write-path pin via `syncProviderConfigToOpenClaw('openai', ...)` and `syncProviderConfigToOpenClaw('openai-codex', ...)`, (b) preservation of a user-supplied override on both paths, (c) the self-heal helper for legacy on-disk openai / openai-codex entries, and (d) sanitization also applies the pin.
docs:
  required: false
---

## Background

OpenClaw 2026.5+ ships a provider-routing policy
([node_modules/openclaw/dist/policy-AKMwD9k5.js](node_modules/openclaw/dist/policy-AKMwD9k5.js),
[node_modules/openclaw/dist/openai-codex-routing-kS7Ub1vB.js](node_modules/openclaw/dist/openai-codex-routing-kS7Ub1vB.js))
that auto-routes every `models.providers.openai` entry whose `baseUrl` is the
official `https://api.openai.com/v1` endpoint through the `codex` agent
harness. The intent is to give OpenAI Codex OAuth accounts a richer
trajectory, but the heuristic does not distinguish API-key vs OAuth setups —
it always picks `codex` when the baseUrl matches.

The bundled OpenClaw distribution we ship does not register any agent harness
with id `"codex"` (only `cliBackends: ["codex-cli"]` is declared by the OpenAI
plugin manifest at
`node_modules/openclaw/dist/extensions/openai/openclaw.plugin.json`). As a
result, every API-key OpenAI chat fails inside
[node_modules/openclaw/dist/selection-61FIEezO.js](node_modules/openclaw/dist/selection-61FIEezO.js)
with:

```
Requested agent harness "codex" is not registered.
```

Provider-side validation passes (the API key is valid; the protocol is in the
allow-list); the failure is purely about agent harness selection.

The fix is to make ClawX write an explicit `agentRuntime: { id: "pi" }` on
every `models.providers.openai` entry. OpenClaw's policy resolver honours an
explicit `agentRuntime.id` before falling into the codex auto-routing
heuristic, so the API-key path is rescued from the unbundled harness without
disturbing OAuth users (whose entry lives under the separate
`models.providers.openai-codex` key).

## Scope

- Add an `OPENCLAW_PROVIDER_PINNED_AGENT_RUNTIME` map in
  `electron/utils/openclaw-auth.ts` (currently `{ openai: 'pi', 'openai-codex': 'pi' }`) and apply
  it inside `upsertOpenClawProviderEntry` so every write of a pinned provider
  carries `agentRuntime: { id: <runtime> }` when the entry does not already
  specify one.
- Export `ensureOpenClawProviderAgentRuntimePins()` as a self-heal helper
  that walks existing `models.providers.*` entries on disk and writes the pin
  in place when missing — mirroring `pruneInvalidApiProviderEntries`. Also call
  it from `sanitizeOpenClawConfig` after maxTokens healing so every Gateway launch
  repairs stale entries.
- Call the helper in `syncDefaultProviderToRuntime` immediately after
  `pruneInvalidApiProviderEntries`, before any OAuth/non-OAuth branching, so
  the repair happens once per default-provider switch.
- Cover both the write-path pin, the self-heal path, and the sanitize path in
  `tests/unit/openclaw-auth.test.ts`. Verify that both the `openai` and
  `openai-codex` entries receive the pin and that any user-supplied
  `agentRuntime` override is preserved on all paths.

## Out of scope

- Upstream changes to OpenClaw's policy resolver so it would only auto-route
  to `codex` when an `openai-codex` harness is actually registered.
- Pin policy for any other provider key besides `openai`. Future providers
  that need the same defense can be added to the map without further
  plumbing.
- Renderer-side UI surface for picking a different agent runtime per
  provider — there is no user-visible UI change in this task.
- README updates (no user-visible UI change).
