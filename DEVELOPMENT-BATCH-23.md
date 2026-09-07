# Development Batch 23 — gateway SSE replay binding

Status: implemented and verified locally.

## Scope

- Bind the bounded gateway invalidation replay to an authenticated SSE endpoint.
- Emit standard SSE IDs, event types, JSON data, and replay heartbeat comments.
- Emit `resync.required` when the requested cursor is outside the retained journal.

## Evidence

- `test/gateway-http.test.js` verifies authenticated SSE replay response formatting.
- `test/gateway-service.test.js` verifies cursor replay and invalidation semantics.
- `npm test`: 40 tests passing.
- `npm run validate`: contract fixture validation passing.

This is a bounded development replay binding. Long-lived connection supervision, complete event families, and final compatibility artifacts remain deferred.
