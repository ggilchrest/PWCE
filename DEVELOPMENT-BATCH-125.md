# Development Batch 125 — enforce authority request schema at HTTP boundary

## Outcome

The gateway authority HTTP route now enforces the published authority request shape. Unknown fields, duplicate scope identities, malformed identity values, and out-of-range TTLs are rejected before authority issuance.

## Evidence

- `src/http/gateway-contract.js` validates the authority request fields and bounds.
- `test/gateway-http.test.js` covers unknown-field and duplicate-scope rejection.
- `npm test` and `npm run validate` pass.

## Boundary

This validation protects the PWCE-owned HTTP contract. It does not authenticate identity fields or widen authority; bearer authentication and principal site scope remain authoritative.
