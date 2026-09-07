# Development Batch 108 — generated invalidation stream consumer

## Outcome

The generated PWCE gateway client now consumes the bounded SSE invalidation transport as an async iterator. It preserves event IDs, event types, multi-line data, comments, and `resync.required` frames while retaining the profile negotiation boundary.

## Evidence

- `src/gateway/generated-client.js` implements `subscribeInvalidations` with bearer authentication and cancellation support.
- `test/generated-client.test.js` verifies profile negotiation and parsed invalidation frames.
- `npm test` — 95 passing tests.
- `npm run validate` — contract validation passed.
- `git diff --check` — passed.

## Boundary

Invalidations prompt consumer refresh and never grant authority or authorize effects. Lifestream still owns mapping these events onto its provider ports.
