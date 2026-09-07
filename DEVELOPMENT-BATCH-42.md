# Development Batch 42 — effect dispatch revalidation

Status: implemented and verified locally.

## Scope

- Record the active grant revision on every admitted Action.
- Revalidate the grant immediately before dispatch so a revoked or changed grant cannot reach the target.
- Preserve denied, failed, timeout, and uncertain outcomes through the Gateway instead of reporting every invocation as completed.

## Evidence

- `test/action-service.test.js` verifies a revoked grant prevents the target call.
- `test/gateway-service.test.js` verifies an uncertain target outcome remains `outcome_unknown`.
- `npm test`: 52 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
