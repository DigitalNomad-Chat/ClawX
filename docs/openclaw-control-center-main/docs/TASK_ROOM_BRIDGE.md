# Task Room Bridge

This bridge keeps `control-center` as the source of truth while letting external chat surfaces mirror room activity.

## What it does

- records outbound room events in `runtime/task-room-bridge-events.json`
- optionally mirrors room events to Discord and Telegram
- includes a deep link back to the `Collaboration` page with `roomId=...`
- never stores room state outside `control-center`

## Supported event types

- `room_created`
- `message_posted`
- `handoff_recorded`
- `executor_assigned`
- `review_submitted`
- `stage_changed`

## Environment flags

- `OPENCLAW_CONTROL_UI_URL`
- `TASK_ROOM_BRIDGE_ENABLED`
- `TASK_ROOM_BRIDGE_DISCORD_WEBHOOK_URL`
- `TASK_ROOM_BRIDGE_TELEGRAM_BOT_TOKEN`
- `TASK_ROOM_BRIDGE_TELEGRAM_CHAT_ID`

## Delivery model

1. Core room mutation succeeds first.
2. Bridge event is written locally.
3. If Discord or Telegram mirroring is enabled, outbound payloads are sent for each configured target.
4. Bridge failures do not roll back the room mutation.

## Operator use

- Use the bridge for mirror notifications and human intervention across Discord or Telegram.
- Use the existing room APIs for any write-back from external bots or moderators.
