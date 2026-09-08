# Development Batch 143 — apply JSON content type to Studio

## Outcome

The shared JSON transport rule now covers Studio’s authenticated POST endpoints for Agent messages, action preview/dispatch, approvals, and approval completion. JSON requests may include charset parameters; missing or non-JSON declarations fail before parsing.

## Evidence

- `src/http/json-body.js` provides the shared content-type guard.
- `src/http/dev-server.js` applies it to known Studio JSON POST routes.
- `src/http/gateway-server.js` uses the same guard for Agent Gateway POST routes.
- `test/json-body.test.js` covers accepted and rejected content types.
- `npm test` and `npm run validate` pass.

## Boundary

This enforces transport declaration only. It does not choose Studio authentication, session, or profile semantics.
