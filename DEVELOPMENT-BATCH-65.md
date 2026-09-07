# Development Batch 65 — malformed WebSocket failure handling

Status: implemented and verified locally.

## Scope

- Convert malformed Home Assistant WebSocket frames into explicit degraded health and bounded connection failure.
- Prevent invalid JSON from becoming an unhandled asynchronous rejection.

## Evidence

- `test/real-boundaries.test.js` verifies malformed frames reject the connection and report `websocket_invalid_message`.
- `npm test`: 61 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
