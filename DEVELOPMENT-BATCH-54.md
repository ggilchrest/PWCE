# Development Batch 54 — capability version binding

Status: implemented and verified locally.

## Scope

- Bind each admitted Action to the capability descriptor version used for authorization.
- Reject mismatched versions during preview and fail closed if the descriptor changes before dispatch.

## Evidence

- `test/action-service.test.js` verifies capability-version mismatch is denied.
- `npm test`: 57 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
