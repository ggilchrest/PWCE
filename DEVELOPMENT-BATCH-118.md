# Development Batch 118 — verify the refreshed Lifestream gateway client

## Outcome

The refreshed Lifestream `providers-pwce` client was exercised against a real local PWCE HTTP server using the published gateway token. Profile negotiation, scoped read-only requests, incompatible-profile rejection, and unadvertised-operation denial all passed.

## Evidence

- Lifestream commit `5a04b3e` pins the current PWCE bundle and artifact digests.
- `node --test --experimental-strip-types packages/providers-pwce/test/client.test.ts` — 3 tests passed against `http://127.0.0.1:4183`.
- The disposable PWCE server was stopped after the run.

## Boundary

This verifies the refreshed core client transport only. Lifestream `LS-S029` provider evidence remains separate and does not become a PWCE acceptance claim.
