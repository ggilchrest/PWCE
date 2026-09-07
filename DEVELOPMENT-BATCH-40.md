# Development Batch 40 — reconnect configuration validation

Status: implemented and verified locally.

## Scope

- Validate reconnect timing and attempt settings when Studio starts.
- Preserve bounded defaults and `0` unlimited-attempt behavior.
- Fail fast with an environment-variable-specific error instead of failing during a later outage.

## Evidence

- `test/reconnect-policy.test.js` verifies valid, malformed, and inconsistent settings.
- `npm test`: 50 tests passing.
- `npm run validate`: contract fixture validation passing.
