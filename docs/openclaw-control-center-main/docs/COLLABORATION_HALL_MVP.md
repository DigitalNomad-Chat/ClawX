# Collaboration Hall MVP

## Product shape
- `Collaboration` defaults to one shared hall, not one task room per task.
- Operators post requests in the hall.
- Agents reply using the current real roster names from `openclaw.json` / runtime roster discovery.
- Agent replies stream into the hall as SSE draft deltas before the final persisted message lands.
- When hall runtime dispatch is enabled, those draft deltas are backed by real `openclaw agent` runs and normalized session history, not only synthetic orchestrator text.
- When the runtime exposes live stdout, the hall now prefers that direct stream first and only falls back to session-history deltas when needed.
- Task rooms remain available as secondary detail and evidence threads.

## Core objects
- `CollaborationHall`: the shared group chat container.
- `HallTaskCard`: the task card anchored in the hall timeline.
- `HallMessage`: one message in the shared timeline.
- `TaskRoom`: the linked detail/evidence thread behind a task card.

## Routing rules
- `@RealAgentName` routes only to the matching participant.
- `@all` broadcasts to the active hall participants.
- No mention on a new task routes to the planner-like participant first.
- No mention during execution routes to the current execution owner first.

## State model
- `discussion`: agents discuss the task and no execution tools are allowed.
- `execution`: one owner holds the execution lock and posts the main work updates.
- `review`: reviewer and operator decide whether the task passes or goes back.
- `blocked`: the task needs human help or a new handoff.
- `completed`: the task is done and the result stays visible in the hall timeline.

## Anti-chaos guarantees
- One shared hall, but each task has one default execution owner.
- Speaker selection is explicit and deterministic.
- Execution requires a lock; another agent cannot silently take over.
- Runtime assignment can continue through several automatic execution turns before pausing, but only one owner still holds the lock during that chain.
- Multi-agent cooperation uses structured handoff packets:
  - `goal`
  - `current_result`
  - `done_when`
  - `blockers`
  - `next_owner`
  - `requires_input_from`

## UI principles
- Hall timeline is the visual center.
- Task cards stay visible, but secondary to the active conversation.
- Draft agent replies should feel live, not poll-based, while still settling into durable stored messages.
- The operator should be able to answer three questions in under five seconds:
  - Who is speaking now?
  - Who owns execution now?
  - What happens next?

## Delivery model
- Hall clients subscribe to `/api/hall/events` with `EventSource`.
- Linked task-room clients subscribe to `/api/rooms/:roomId/events`.
- Generated agent replies emit `draft_start`, `draft_delta`, and `draft_complete` events.
- Hall discussion, assign, and handoff can dispatch to the real OpenClaw runtime, poll the live session history, and turn new assistant/tool output into draft deltas.
- Automatic execution chains can keep dispatching the same owner for a bounded number of runtime turns before the task moves into `review`, `blocked`, or manual continuation.
- Final messages still persist through the normal hall / room stores so refresh, replay, and summaries stay durable.
