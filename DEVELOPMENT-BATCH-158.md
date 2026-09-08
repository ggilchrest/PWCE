# Development Batch 158 — validate target results

## Outcome

PWCE now validates the target result before persisting an Action outcome. A malformed provider result becomes `outcome_unknown` with an unknown external-effect state, and all recognized terminal statuses are protected from accidental re-dispatch.

## Evidence

- `test/action-service.test.js` covers malformed target output and existing terminal outcomes.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

This validates the Action status and external-effect indicator. It does not establish independent state reconciliation or convert an acknowledgement into success.
