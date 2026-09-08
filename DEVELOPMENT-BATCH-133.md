# Development Batch 133 — bound gateway SSE frames

## Outcome

The gateway HTTP binding now checks initial SSE frames against the shared 1 MiB transport limit before sending stream headers and closes the stream if a later frame exceeds the bound.

## Evidence

- `src/http/gateway-server.js` bounds serialized SSE frames.
- `test/gateway-http.test.js` covers rejection of an oversized initial event.
- `npm test` and `npm run validate` pass.

## Boundary

This limits transport frames only. Cursor-based replay and resynchronization remain the stream’s recovery mechanism; no event is promoted to World truth by the transport.
