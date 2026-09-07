# Development Batch 92 — bounded gateway query responses

## Outcome

Gateway context queries now declare and validate `summary`, `standard`, or `evidence` detail and can enforce a caller-provided response byte ceiling. Item counts remain bounded by the existing query limits; an insufficient byte ceiling fails explicitly instead of silently returning an oversized response.

## Evidence

- `src/gateway/gateway-service.js` validates query detail and `maxBytes` and returns `limit_exceeded` when the bound cannot be met.
- `test/gateway-service.test.js` verifies accepted detail, invalid detail, and byte-limit behavior.
- `npm test` — passing.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The response bound controls transport size only. It does not widen authority, remove evidence, merge site identities, or reinterpret stale, unknown, or conflicted state.
