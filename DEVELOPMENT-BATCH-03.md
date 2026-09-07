# PWCE development batch 03

## Scope completed

1. Read-only `pwce-agent-gateway.v1` service boundary.
2. Authenticated principal registration using non-persisted token digests.
3. Short-lived, site-scoped authority contexts.
4. Fail-closed profile/version, expiry, and cross-site checks.
5. `context.query` for current, history, as-of, explain, and bounded search reads.
6. `evidence.get` with authority revalidation.
7. `health.get` and an explicit no-effect `capabilities.getSnapshot`.

## Validation

- `npm test`: 16 tests passed.
- `npm run validate`: 13 contract vectors and 3 manifest digests passed.

## Explicit boundary

This is an in-process read-only gateway foundation. It does not expose a network listener, implement live Agent or Lifestream compatibility, register effectful capabilities, authorize dispatch, or call Home Assistant services.
