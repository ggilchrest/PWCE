# Development Batch 15 — Home Assistant source health transitions

Status: implemented and verified locally.

## Scope

- Publish adapter health transitions for WebSocket connecting, authenticated online, degraded authentication/connection failure, closed offline, and adapter shutdown.
- Persist the latest source health reason and event time in the existing state store.
- Keep runtime status and source health distinct but consistent in the Studio health response.

## Evidence

- WebSocket boundary test now verifies online and offline callbacks.
- `npm test`: 34 tests passing.
- `npm run validate`: contract fixture validation passing.

Production availability and reconnect/backoff behavior remain unclaimed; this is local adapter evidence only.
