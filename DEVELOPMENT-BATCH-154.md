# Development Batch 154 — bound Home Assistant REST requests

## Outcome

Home Assistant REST requests now carry an abort signal and default to a ten-second timeout. A stalled external call cannot hold a Studio sync or action request indefinitely; callers receive the transport failure and existing runtime degradation/retry handling can respond.

## Evidence

- `test/real-boundaries.test.js` verifies a configured short timeout aborts a stalled request.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

The timeout bounds REST transport work only. It does not claim Home Assistant actuation succeeded; independent observation and reconciliation remain required.
