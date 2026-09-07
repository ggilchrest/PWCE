# Development Batch 62 — observation idempotency conflicts

Status: implemented and verified locally.

## Scope

- Compare normalized observation content when an idempotency key is reused.
- Return stable `idempotency_conflict` for changed observation content instead of silently treating it as a duplicate.

## Evidence

- `test/runtime-state.test.js` verifies identical observations replay and changed content is rejected.
- `npm test`: 59 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
