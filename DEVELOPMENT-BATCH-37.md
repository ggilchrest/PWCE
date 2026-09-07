# Development Batch 37 — invalidation retention resynchronization

Status: implemented and verified locally.

## Scope

- Verify bounded event-journal eviction does not return incomplete history as if it were complete.
- Signal `resyncRequired` when a consumer’s cursor predates retained events.
- Return no partial replay when resynchronization is required.

## Evidence

- `test/gateway-service.test.js` overflows a bounded retention journal and verifies explicit resynchronization; the production default remains 500 events.
- `npm test`: 49 tests passing.
- `npm run validate`: contract fixture validation passing.

Resynchronization remains a local development behavior; durable cursor storage and refresh orchestration remain deferred.
