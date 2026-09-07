# Development Batch 89 — audience-bound gateway authority

## Outcome

Gateway authority contexts can now bind optional Assistant, endpoint, participant, and audience identities independently of the authenticated Agent principal. Requests must present the same identity set that was bound when authority was issued; changing the Assistant or audience fails with a scope denial.

## Evidence

- `src/gateway/gateway-service.js` stores and validates the optional identity dimensions on authority contexts.
- `test/gateway-service.test.js` proves valid identity reuse and rejects Assistant/audience substitution.
- `npm test` — 82 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The identity fields do not authenticate a caller by themselves. The existing bearer-token and time-bounded authority checks remain mandatory, and an identity mismatch cannot widen or transfer authority.
