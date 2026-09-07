# Development Batch 60 — stable idempotency conflict errors

Status: implemented and verified locally.

## Scope

- Give conflicting reuse of an Action idempotency key the stable `idempotency_conflict` error code.
- Preserve the existing fail-closed behavior and avoid treating changed input as a duplicate.

## Evidence

- `test/action-service.test.js` verifies the stable conflict code.
- `npm test`: 58 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
