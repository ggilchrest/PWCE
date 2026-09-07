# Development Batch 46 — capability idempotency metadata

Status: implemented and verified locally.

## Scope

- Expose the capability's required idempotency behavior in its Agent-visible descriptor.
- Keep the descriptor aligned with the existing conflict and replay enforcement.

## Evidence

- `test/action-service.test.js` verifies the reversible capability advertises `idempotency: required`.
- `npm test`: 53 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
