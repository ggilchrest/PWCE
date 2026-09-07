# Development Batch 56 — dispatch idempotency enforcement

Status: implemented and verified locally.

## Scope

- Enforce the declared idempotency requirement at Action admission.
- Keep side-effect-free authority preview available without an idempotency key while denying dispatch admission without one.
- Bound accepted idempotency keys to 128 characters.

## Evidence

- `test/action-service.test.js` verifies missing idempotency is denied at admission.
- `npm test`: 57 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
