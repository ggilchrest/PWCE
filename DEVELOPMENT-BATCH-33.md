# Development Batch 33 — consistent activated grant views

Status: implemented and verified locally.

## Scope

- Expose the activated principal’s bounded ActionService site and capability grants through `authority.getGrants`.
- Keep internal target bindings, credentials, and grant implementation details private.
- Preserve the explicit no-grant result when no ActionService is activated.

## Evidence

- `test/gateway-service.test.js` verifies an activated fixture principal sees its `home.light.set_level` grant.
- `npm test`: 46 tests passing.
- `npm run validate`: contract fixture validation passing.
