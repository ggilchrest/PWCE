# Development Batch 123 — preserve HTTP authority identity bindings

## Outcome

The authenticated gateway HTTP authority route now preserves Assistant, endpoint, participant, and audience identity fields when issuing an authority context. Requests using a different identity are denied at the gateway boundary with the correct forbidden response.

## Evidence

- `src/http/gateway-server.js` forwards all optional authority identity fields.
- `test/gateway-http.test.js` verifies accepted matching identities and denied mismatches over HTTP.
- Authenticated scope failures now return `403` instead of being mistaken for unauthenticated requests.
- `npm test` and `npm run validate` pass.

## Boundary

Presence or identity fields do not authenticate a caller; bearer authentication and the existing scoped authority checks remain required.
