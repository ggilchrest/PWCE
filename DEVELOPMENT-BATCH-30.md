# Development Batch 30 — live approval cannot be bypassed

Status: implemented and verified locally.

## Scope

- Force live gateway capability requests through runtime Human approval even when the caller supplies `approvalRequired: false`.
- Keep fixture/test invocations configurable for deterministic local tests.
- Preserve the existing explicit live-effects enablement guard.

## Evidence

- `test/gateway-service.test.js` verifies a live evaluation remains `approval_required` when a caller tries to disable approval.
- `npm test`: 45 tests passing.
- `npm run validate`: contract fixture validation passing.

No live Home Assistant effect is enabled by this change.
