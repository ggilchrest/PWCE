# Development Batch 144 — type request body stream failures

## Outcome

The shared JSON body reader now reports request stream failures as `invalid_request` instead of exposing raw iterator errors. Oversized bodies continue to report `limit_exceeded` unchanged.

## Evidence

- `src/http/json-body.js` classifies body iterator failures at the HTTP boundary.
- `test/json-body.test.js` covers a failing request stream.
- `npm test` and `npm run validate` pass.

## Boundary

This classifies incomplete or unavailable request transport. It does not infer a payload, retry a request, or change authentication/session semantics.
