# Development Batch 34 — narrowed gateway grant views

Status: implemented and verified locally.

## Scope

- Intersect ActionService site grants with the active short-lived authority context.
- Prevent `authority.getGrants` from widening a caller’s requested scope.
- Preserve capability grant visibility without exposing internal bindings.

## Evidence

- `test/gateway-service.test.js` verifies a two-site grant is reported as one site under a one-site authority context.
- `npm test`: 47 tests passing.
- `npm run validate`: contract fixture validation passing.
