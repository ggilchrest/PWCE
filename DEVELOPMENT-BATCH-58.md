# Development Batch 58 — durable approval expiry

Status: implemented and verified locally.

## Scope

- Persist the `expired` approval transition before returning the expiration error.
- Record the expiration in durable audit history so a failed approval attempt is not indistinguishable from an unattempted pending approval.

## Evidence

- `test/real-boundaries.test.js` verifies expired approval status and audit-safe failure behavior.
- `npm test`: 57 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
