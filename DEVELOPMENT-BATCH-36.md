# Development Batch 36 — gateway lifecycle cleanup

Status: implemented and verified locally.

## Scope

- Unsubscribe gateway instances from the state store when their server closes.
- Remove live event listeners during gateway cleanup.
- Prevent disconnected or failing event consumers from affecting committed state changes.

## Evidence

- `src/gateway/gateway-service.js` now exposes explicit cleanup for its store and stream subscriptions.
- `src/http/dev-server.js` closes the gateway binding with the server lifecycle.
- `npm test`: 48 tests passing.
- `npm run validate`: contract fixture validation passing.

This is local process lifecycle hardening; it does not claim distributed stream supervision.
