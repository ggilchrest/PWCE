# Development Batch 27 — authority revision invalidation

Status: implemented and verified locally.

## Scope

- Add a revision to each registered Agent principal.
- Bind issued authority contexts to the principal revision.
- Invalidate old contexts after credential or scope re-registration.
- Publish `authority.invalidated` without exposing credentials.

## Evidence

- `test/gateway-service.test.js` verifies a rotated principal invalidates an existing authority context.
- `npm test`: 43 tests passing.
- `npm run validate`: contract fixture validation passing.

This protects the current local authority model; durable distributed revocation and compatibility artifacts remain outside the active development tier.
