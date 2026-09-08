# Development Batch 145 — require Studio object bodies

## Outcome

Studio JSON POST routes now reject `null`, arrays, and scalar JSON values before route handling. They return the stable `invalid_request` outcome rather than exposing route-level JavaScript errors.

## Evidence

- `src/http/json-body.js` adds the shared object-body reader.
- `src/http/dev-server.js` uses it for Agent messages, action requests, and approvals.
- `test/json-body.test.js` covers valid objects and non-object JSON values.
- `npm test` and `npm run validate` pass.

## Boundary

This validates the common body shape only. Endpoint-specific fields remain validated by their owning service.
