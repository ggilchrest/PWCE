# Development Batch 38 — grant-change invalidation delivery

Status: implemented and verified locally.

## Scope

- Notify open gateway streams when ActionService grant scope changes.
- Bind the invalidation to the affected Agent principal.
- Keep request fail-closed behavior synchronized with stream notification.

## Evidence

- `test/gateway-service.test.js` verifies the grant-change `authority.invalidated` event and invalidated-context rejection.
- `npm test`: 49 tests passing.
- `npm run validate`: contract fixture validation passing.

Distributed grant coordination remains outside the local development tier.
