# Development Batch 18 — approval and Studio route scope hardening

Status: implemented and verified locally.

## Scope

- Retain principal, site, and capability scope on runtime approval records.
- Re-check approval site scope at the secured Studio approval endpoint.
- Apply explicit site authorization to history queries, including caller-selected selectors.

## Evidence

- `test/real-boundaries.test.js` verifies approval records retain principal and site scope.
- `npm test`: 37 tests passing.
- `npm run validate`: contract fixture validation passing.

This is backend authorization hardening with no new user-facing flow.
