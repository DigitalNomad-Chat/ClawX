---
id: hermes-server-phase2-batch-a
title: Hermes server phase 2 Batch A — remove Koa/Hermes route entry and routes
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: >
  Remove the dead Koa Web UI route entry (server/src/routes/index.ts), all
  Hermes routes under server/src/routes/hermes/, and the plain Koa routes
  (health/auth/upload/update/webhook). Keep server/src/routes/hermes/group-chat.ts
  in place because controllers/hermes/sessions.ts imports getGroupChatServer from it;
  group-chat.ts will be removed together with its controller in Batch B.
  No config/db/env/Electron/OpenClaw/M4/P4b changes. Preserve shared infrastructure.
touchedAreas:
  - server/src/routes/index.ts
  - server/src/routes/hermes/chat-run.ts
  - server/src/routes/hermes/codex-auth.ts
  - server/src/routes/hermes/config.ts
  - server/src/routes/hermes/copilot-auth.ts
  - server/src/routes/hermes/cron-history.ts
  - server/src/routes/hermes/download.ts
  - server/src/routes/hermes/files.ts
  - server/src/routes/hermes/gateways.ts
  - server/src/routes/hermes/jobs.ts
  - server/src/routes/hermes/kanban-events.ts
  - server/src/routes/hermes/kanban.ts
  - server/src/routes/hermes/logs.ts
  - server/src/routes/hermes/memory.ts
  - server/src/routes/hermes/models.ts
  - server/src/routes/hermes/nous-auth.ts
  - server/src/routes/hermes/plugins.ts
  - server/src/routes/hermes/profiles.ts
  - server/src/routes/hermes/providers.ts
  - server/src/routes/hermes/proxy-handler.ts
  - server/src/routes/hermes/proxy.ts
  - server/src/routes/hermes/sessions.ts
  - server/src/routes/hermes/skills.ts
  - server/src/routes/hermes/terminal.ts
  - server/src/routes/hermes/tts.ts
  - server/src/routes/hermes/weixin.ts
  - server/src/routes/hermes/xai-auth.ts
  - server/src/routes/health.ts
  - server/src/routes/auth.ts
  - server/src/routes/upload.ts
  - server/src/routes/update.ts
  - server/src/routes/webhook.ts
  - harness/specs/tasks/hermes-server-phase2-batch-a.md
  - tests/unit/hermes-server-batch-a.test.ts
expectedUserBehavior:
  - No user-visible behavior change; the removed Koa Web UI server is not used by
    the Electron/OpenClaw runtime.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
requiredTests:
  - pnpm run typecheck
  - pnpm --filter clawx-license-server run typecheck
  - pnpm run harness:ci
  - tests/unit/hermes-server-batch-a.test.ts
acceptance:
  - server/src/routes/index.ts and target route files no longer exist.
  - No non-Hermes code imports the deleted route files.
  - server/src/routes/hermes/group-chat.ts remains because a Hermes controller still
    imports it; it will be removed in Batch B.
  - TypeScript checks pass for both root and server packages.
docs:
  required: false
---

# Hermes server phase 2 — Batch A

## Scope
- Delete the Koa route entry and all Hermes/plain Koa routes listed in `touchedAreas`.
- Leave `server/src/routes/hermes/group-chat.ts` for Batch B.

## Out of scope
- Batch B/C/D/E (controllers, services, DB, config, env, resources).
- Any change to Electron main process, OpenClaw runtime, M4, P4b, chat/media/proxy.
