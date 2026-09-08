# Development Batch 131 — bound generated SSE buffers

## Outcome

The generated gateway client now caps buffered SSE data at the shared 1 MiB transport limit and fails closed on an oversized unterminated frame.

## Evidence

- `src/gateway/generated-client.js` bounds the decoded SSE buffer while reading.
- `test/generated-client.test.js` covers an oversized stream frame.
- `npm test` and `npm run validate` pass.

## Boundary

This protects the client transport buffer. The stream remains resumable through its existing opaque cursor and resynchronization events; it does not reinterpret gateway invalidations as World facts.
