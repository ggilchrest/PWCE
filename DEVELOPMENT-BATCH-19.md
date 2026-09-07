# Development Batch 19 — prepared context and bounded grants

Status: implemented and verified locally.

## Scope

- Add the required read-only `context.getPreparedInputs` gateway operation.
- Add the bounded `authority.getGrants` view for the authenticated Agent principal.
- Preserve site filtering, evidence references, source health, revision, and explicit limitations.
- Keep prepared inputs separate from Lifestream prompt or conversation context.

## Evidence

- `test/gateway-service.test.js` verifies site-scoped prepared inputs exclude another site and grant view exposes no unactivated effect capabilities.
- `npm test`: 38 tests passing.
- `npm run validate`: contract fixture validation passing.

Exact generated wire schemas and compatibility artifacts remain deferred as specified.
