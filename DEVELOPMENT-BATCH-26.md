# Development Batch 26 — governed gateway capability invocation

Status: implemented and verified locally.

## Scope

- Wire gateway capability snapshots, authority evaluation, invocation, and invocation status to the existing governed ActionService when activated.
- Keep the unactivated gateway explicitly no-effect.
- Require stable idempotency keys for Agent invocations.
- Bind runtime approvals to the exact Agent principal as well as the action content.

## Evidence

- `test/gateway-service.test.js` verifies fixture capability evaluation, invocation, status lookup, and missing-idempotency rejection.
- `test/real-boundaries.test.js` verifies approval rejection for a different principal.
- `npm test`: 42 tests passing.
- `npm run validate`: contract fixture validation passing.

Real Home Assistant gateway effects remain protected by the existing live-effects flag and runtime approval path.
