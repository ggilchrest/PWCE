# Development Batch 66 — WebSocket subscription result handling

Status: implemented and verified locally.

## Scope

- Track the Home Assistant `subscribe_events` command identity.
- Mark the adapter degraded when Home Assistant rejects the live event subscription.
- Preserve explicit reconnect supervision instead of reporting a failed subscription as healthy.

## Evidence

- `test/real-boundaries.test.js` verifies rejected event subscriptions produce `websocket_subscription_failed`.
- `npm test`: 62 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
