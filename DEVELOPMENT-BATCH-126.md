# Development Batch 126 — bound gateway request bodies

## Outcome

The authenticated gateway HTTP binding now rejects request bodies larger than the shared 1 MiB transport limit before parsing or dispatching them.

## Evidence

- `src/http/gateway-server.js` counts UTF-8 bytes while reading the request stream and returns a typed limit error.
- `test/gateway-http.test.js` covers an oversized authority request.
- `npm test` and `npm run validate` pass.

## Boundary

The limit applies to transport frames, not durable artifacts. Larger data must use the applicable bounded reference contract rather than bypassing the gateway body limit.
