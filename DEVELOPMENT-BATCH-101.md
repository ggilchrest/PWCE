# Development Batch 101 — caller freshness policy

## Outcome

Gateway current and explanation queries now accept a bounded maximum evidence age and an explicit stale-data policy. Evidence older than the requested age remains labeled `stale`; callers that do not allow stale data receive no value, while evidence references and limitations remain visible.

## Evidence

- `src/gateway/gateway-service.js` validates and applies `maxAgeMs` and `allowStale`.
- `test/gateway-service.test.js` verifies stale withholding and explicit stale allowance.
- `npm test` — 87 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

This policy does not rewrite source freshness, convert stale evidence to unknown, or authorize an effect. It only qualifies a query result for the requesting caller.
