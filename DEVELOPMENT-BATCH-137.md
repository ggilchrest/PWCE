# Development Batch 137 — type malformed gateway responses

## Outcome

The generated gateway client now reports malformed JSON as the stable `invalid_gateway_response` outcome instead of exposing a runtime parser exception.

## Evidence

- `src/gateway/generated-client.js` catches and types JSON decoding failures.
- `test/generated-client.test.js` covers malformed successful responses.
- `npm test` and `npm run validate` pass.

## Boundary

This identifies a transport/protocol failure. It does not reinterpret a valid gateway error or retry an uncertain operation.
