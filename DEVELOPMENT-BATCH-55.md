# Development Batch 55 — approval capability-version binding

Status: implemented and verified locally.

## Scope

- Include capability descriptor version in normalized Action and Human-approval fingerprints.
- Reject reuse of an approval across capability versions.

## Evidence

- `test/real-boundaries.test.js` verifies a version change invalidates the approval fingerprint.
- `npm test`: 57 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
