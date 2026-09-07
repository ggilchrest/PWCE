# Development Batch 61 — WebSocket generation guards

Status: implemented and verified locally.

## Scope

- Ignore late events and close notifications from superseded Home Assistant WebSocket connections.
- Reject a live-event connection that closes or errors before authentication instead of leaving its startup promise pending.

## Evidence

- `test/real-boundaries.test.js` verifies pre-auth close rejection and stale-socket isolation.
- `npm test`: 59 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
