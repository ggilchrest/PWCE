# Development Batch 47 — capability snapshot identity

Status: implemented and verified locally.

## Scope

- Give each Agent-visible capability snapshot an immutable identity and issuance boundary.
- Preserve principal/site scope, expiry, source revision, and invalidation sequence in the snapshot.

## Evidence

- `test/gateway-service.test.js` verifies snapshot identity, issuance time, scope, expiry, and invalidation sequence.
- `npm test`: 53 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
