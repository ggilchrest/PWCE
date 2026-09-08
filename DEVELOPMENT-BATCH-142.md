# Development Batch 142 — enforce gateway JSON content type

## Outcome

The Agent Gateway HTTP binding now requires `application/json` for authority and request POST bodies. Charset parameters remain accepted, while text or missing content types fail with the stable `invalid_request` code before payload parsing.

## Evidence

- `src/http/gateway-server.js` enforces the JSON content-type boundary.
- `test/gateway-http.test.js` covers rejection of a non-JSON POST content type.
- `npm test` and `npm run validate` pass.

## Boundary

This enforces transport declaration only. It does not change authentication, authority, or operation-specific schema validation.
