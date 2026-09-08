# Development Batch 128 — bound generated client requests

## Outcome

The generated PWCE gateway client now enforces the same 1 MiB JSON transport limit as the HTTP server and rejects oversized payloads before network transport.

## Evidence

- `src/gateway/generated-client.js` measures UTF-8 request bytes before `fetch`.
- `test/generated-client.test.js` verifies the oversized request is rejected and only profile negotiation occurs.
- `npm test` and `npm run validate` pass.

## Boundary

This is a transport bound, not an artifact-size policy. The client remains transport-only and does not interpret Lifestream-owned payload semantics.
