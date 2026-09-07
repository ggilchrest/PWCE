# Development Batch 67 — Pre-socket reconnect health

Status: implemented and verified locally.

## Scope

- Persist Home Assistant source health when a live reconnect fails before the WebSocket can be created.
- Keep Studio runtime status and durable source status aligned for token-resolution and socket-factory failures.
- Add regression coverage for the pre-socket failure path.

## Evidence

- `test/studio-http.test.js` verifies a failed socket creation marks `ha.home.one` degraded.
- `npm test`: 63 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
