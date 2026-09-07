# Development Batch 82 — Direct query bounds

Status: implemented and verified locally.

## Scope

- Validate History limits in the owner query service even when called outside the gateway.
- Validate `from` and `to` timestamps before filtering.
- Pass the requested bounded limit through the Studio History HTTP route instead of silently using the default.

## Evidence

- `test/runtime-state.test.js` verifies malformed limits and timestamps are rejected.
- `npm test`: 77 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/domain/query-service.js`: passing.
- `node --check src/http/dev-server.js`: passing.
- `git diff --check`: passing.
