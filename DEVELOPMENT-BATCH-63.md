# Development Batch 63 — adapter shutdown cancellation

Status: implemented and verified locally.

## Scope

- Cancel pending Home Assistant WebSocket authentication when the adapter closes.
- Keep connection-generation guards intact so shutdown cannot emit stale status from an old socket.

## Evidence

- `test/real-boundaries.test.js` verifies adapter close rejects pending authentication.
- `npm test`: 60 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
