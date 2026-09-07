# PWCE development batch 04

## Scope completed

1. Bounded reversible capability catalog and snapshot.
2. Deterministic grant-based policy preview.
3. Separate action admission from target dispatch.
4. Test-only target execution with observed result evidence.
5. Idempotent replay protection and conflicting-request rejection.
6. Explicit live-route denial, timeout, and `outcome_unknown` outcomes.

## Validation

- `npm test`: 21 tests passed.
- `npm run validate`: 13 contract vectors and 3 manifest digests passed.

## Explicit boundary

This batch uses an isolated fixture target only. No Home Assistant service call, live credential, notification, or external effect is reachable. The next production-relevant choice is the real Home Assistant adapter/authentication and approval boundary.
