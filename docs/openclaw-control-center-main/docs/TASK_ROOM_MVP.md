# Task Room MVP

This document defines the first MVP for task-room collaboration inside OpenClaw Control Center.

Note: task rooms are now secondary detail and evidence threads behind the hall-first collaboration surface. They still preserve the room lifecycle below, and generated room replies now stream to the UI as draft deltas before the final message is persisted.

## Goal

Give each tracked task one durable collaboration room where:

- humans can post requests directly
- `planner`, `coder`, `reviewer`, and `manager` discuss in sequence
- the system chooses an executor
- execution and review stay on one timeline
- task status and room state stay aligned

## Room Stages

- `intake`: the room exists but structured discussion has not started
- `discussion`: the orchestrator is collecting planner/coder/reviewer/manager messages
- `assigned`: an executor has been selected and the handoff is recorded
- `executing`: the executor is actively posting status or result updates
- `review`: execution is waiting for approval or rejection
- `completed`: the task passed review and the room is closed for the MVP flow

## Message Kinds

- `chat`: human request or general conversational note
- `proposal`: structured plan from planner/coder/reviewer
- `decision`: manager decision containing executor and done condition
- `handoff`: explicit ownership transfer between roles
- `status`: execution heartbeat or state transition note
- `result`: final output or review outcome

## MVP Rules

1. One task can have only one primary room.
2. A room can contain multiple handoffs.
3. Discussion starts with `planner`.
4. `coder` and `reviewer` each get one discussion turn per human prompt.
5. `manager` closes the discussion with a structured decision.
6. Once assigned, only the executor keeps talking unless another role is explicitly mentioned.
7. Review approval marks the task `done`.
8. Review rejection returns the task to `in_progress` or `blocked`.

## Stored Artifacts

- `runtime/chat-rooms.json`
- `runtime/chat-messages.json`
- `runtime/chat-summaries.json`

## Structured Decision Output

The manager decision must provide:

- `proposal`
- `decision`
- `executor`
- `done_when`
