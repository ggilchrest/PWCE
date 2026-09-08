# Development Batch 146 — validate request framing

## Outcome

The shared JSON body reader now validates `Content-Length` framing. Malformed, negative, or fractional declarations fail as `invalid_request`; declarations over the transport limit remain `limit_exceeded`; mismatches with the received UTF-8 byte count fail before JSON parsing.

## Evidence

- `src/http/json-body.js` validates declared and actual request byte lengths.
- `test/json-body.test.js` covers malformed and mismatched declarations.
- `npm test` and `npm run validate` pass.

## Boundary

This validates HTTP request framing only. It does not infer missing bytes, retry a request, or alter authentication/session semantics.
