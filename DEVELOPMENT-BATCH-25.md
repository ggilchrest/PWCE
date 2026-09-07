# Development Batch 25 — scoped, expiring capability snapshots

Status: implemented and verified locally.

## Scope

- Include authority site scope and expiry in gateway capability snapshots.
- Keep capability visibility distinct from authorization, availability, approval, and success.
- Preserve the explicit no-effect result for the current development tier.

## Evidence

- `test/gateway-service.test.js` verifies the no-effect snapshot carries site scope and an expiry.
- `npm test`: 41 tests passing.
- `npm run validate`: contract fixture validation passing.

Effect capabilities remain unactivated in the current gateway tier.
