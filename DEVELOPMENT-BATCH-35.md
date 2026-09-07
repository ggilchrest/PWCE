# Development Batch 35 — grant revision revalidation

Status: implemented and verified locally.

## Scope

- Version each principal’s ActionService grant.
- Bind effect authority contexts to the grant revision active at issuance.
- Invalidate contexts when grant scope or capability membership changes.
- Notify already-open authority streams when grant scope changes.
- Preserve fail-closed behavior before gateway operations proceed.

## Evidence

- `test/gateway-service.test.js` verifies grant re-registration invalidates an existing effect authority context and emits the scoped invalidation event.
- `npm test`: 49 tests passing.
- `npm run validate`: contract fixture validation passing.

Distributed grant revocation and durable grant custody remain outside the local development tier.
