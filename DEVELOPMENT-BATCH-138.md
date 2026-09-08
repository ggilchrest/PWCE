# Development Batch 138 — reject non-object gateway responses

## Outcome

The generated gateway client now treats JSON scalars, arrays, and `null` as invalid gateway responses. Callers receive the stable `invalid_gateway_response` code instead of an uncaught runtime property error.

## Evidence

- `src/gateway/generated-client.js` enforces an object response boundary after JSON decoding.
- `test/generated-client.test.js` covers `null`, arrays, and scalars.
- `npm test` and `npm run validate` pass.

## Boundary

This validates the transport envelope shape only. Operation-specific response schemas remain governed by the published gateway contract and are not inferred by the client.
