# Development Batch 21 — typed gateway errors

Status: implemented and verified locally.

## Scope

- Add stable gateway error codes for profile incompatibility, authentication failure, expired authority, denied scope, invalid requests, and unsupported operations.
- Preserve explanatory messages while making transport responses machine-distinguishable.
- Keep inaccessible evidence represented as an unknown result rather than leaking protected existence.

## Evidence

- `test/gateway-service.test.js` verifies typed profile, expiry, and scope failures.
- `test/gateway-http.test.js` verifies typed unsupported-operation transport errors.
- `npm test`: 39 tests passing.
- `npm run validate`: contract fixture validation passing.
