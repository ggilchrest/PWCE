# PWCE development batch 01

## Scope completed

This batch groups the first dependency-ordered implementation slices so development can continue without a manual continuation after each small change:

1. PV1-T0 contract foundation and fixture validation.
2. Versioned local state with atomic JSON persistence and migration handling.
3. Site, source, and site-qualified entity identity.
4. Observation admission with source/site ownership, timestamps, provenance, and idempotency.
5. Current projection updates that preserve late observations in History.
6. Restart/reload evidence for the local state path.

## Validation

- `npm test`: 8 tests passed.
- `npm run validate`: 13 contract vectors and 3 manifest digests passed.

## Explicit boundary

The implementation uses a local JSON state store as a development foundation. It is not yet the Personal V1 PostgreSQL deployment, a Home Assistant adapter, the Agent Gateway, or a user-facing product flow. Those are separate slices and must not be inferred from these tests.
