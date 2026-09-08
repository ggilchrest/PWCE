# Development Batch 157 — preserve target invocation uncertainty

## Outcome

If an effect target throws during dispatch, PWCE now persists the Action as `outcome_unknown` with `externalEffectOccurred: "unknown"` instead of leaving it admitted or claiming a clean failure. This preserves the possibility that an external service received the request before the transport error.

## Evidence

- `test/action-service.test.js` verifies the persisted terminal result for a throwing target.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

This does not reconcile the target state or claim success. A later explicit reconciliation remains required before the Action can become succeeded.
