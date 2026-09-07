# PWCE development batch 02

## Scope completed

This batch advances the local `PV1-T1` path in one dependency-ordered change set:

1. Deterministic Home Assistant fixture adapter with connect, disconnect, health, and normalized state emission.
2. Source health and degraded/offline reporting.
3. Current, History, and as-of queries with explicit unknown results.
4. Evidence-linked current explanations with freshness/staleness qualification.
5. Canonical observation envelopes with idempotency stored outside the serialized record boundary.

## Validation

- `npm test`: 12 tests passed.
- `npm run validate`: 13 contract vectors and 3 manifest digests passed.

## Explicit boundary

The fixture adapter is deterministic test infrastructure. It does not establish connectivity to a real Home Assistant installation, live credentials, external effect dispatch, or a user-facing Home Status flow. Those remain separate acceptance work.
