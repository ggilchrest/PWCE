# Development Batch 90 — gateway compatibility pin

## Outcome

The fixture external Agent now fails closed when the gateway profile, catalog version, catalog digest, or required read operations do not match its pinned development compatibility profile.

## Evidence

- `src/agent/fixture-profile.js` pins the development profile and catalog digest.
- `src/agent/fixture-external-agent.js` validates that pin before requesting authority or data.
- `test/gateway-http.test.js` proves normal compatibility and catalog digest mismatch denial.
- `npm test` — passing.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

This is a development fixture compatibility pin, not the final cross-product compatibility lock. The Lifestream-owned mapping remains deferred until its exported bundle, version, digest, and lock are available.
