# Development Batch 103 — compatibility lock validation gate

## Outcome

PWCE now has a fail-closed validator for the small cross-repository compatibility lock required before integrated Lifestream adapter work. It requires both profile identities and schema digests, fixtures, adapter revision, environment, required operation coverage, and fixture/real-gateway results.

The validator also requires an explicit Lifestream profile version while leaving its value to the Lifestream-owned bundle.

## Evidence

- `src/gateway/compatibility-lock.js` validates the lock and rejects unpublished schemas.
- `scripts/validate-pwce-compatibility-lock.mjs` provides the command-line validation entry point.
- `test/compatibility-lock.test.js` covers the unpublished-schema and missing-evidence failures.
- `test/compatibility-lock-cli.test.js` covers missing and unreadable lock input.
- `npm test` — expected to pass after this slice.

## Boundary

The validator does not create or infer the Lifestream mapping, schema, fixtures, or adapter revision. It remains intentionally unsatisfied until those Lifestream-owned artifacts and the final PWCE schemas are committed.
