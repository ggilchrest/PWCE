# Development Batch 106 — generated-client profile negotiation

## Outcome

The generated PWCE gateway client now performs mandatory profile negotiation before any request. It verifies the profile identity, version, published schema status, schema/bundle digest, catalog version, and catalog digest, then fails closed on incompatibility.

## Evidence

- `src/gateway/generated-client.js` performs the profile handshake and caches it for the client lifetime.
- `test/generated-client.test.js` covers normal operation and profile mismatch denial.
- `npm test` — expected to pass after this slice.
- `npm run validate` — contract validation remains green.
- `git diff --check` — passed.

## Boundary

This verifies only the PWCE-owned bundle. Lifestream still owns the mapping profile, mapping fixtures, and cross-repository lock.
