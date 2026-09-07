# Development Batch 94 — source-bound history cursors

## Outcome

Bounded history queries now return an opaque continuation cursor and resume from it. Each cursor is bound to the exact site/entity/property/time query and current source revision; malformed, mismatched, or stale cursors fail closed.

## Evidence

- `src/domain/query-service.js` encodes and validates bounded history cursors.
- `src/gateway/gateway-service.js` applies the cursor input bound at the gateway boundary.
- `test/gateway-service.test.js` verifies continuation and query-mismatch denial.
- `npm test` — passing.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The cursor does not extend authority or freeze a historical snapshot across revisions. Any source revision change invalidates it and requires a fresh query.
