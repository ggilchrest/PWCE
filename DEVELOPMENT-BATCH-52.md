# Development Batch 52 — initial sync health

Status: implemented and verified locally.

## Scope

- Mark the registered Home Assistant source degraded when initial REST synchronization fails.
- Keep Studio runtime and source health aligned without claiming stale data is current.

## Evidence

- `test/studio-http.test.js` verifies a failed initial sync produces degraded source health.
- `npm test`: 56 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
