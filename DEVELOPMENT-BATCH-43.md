# Development Batch 43 — gateway invalidation and SSE error boundaries

Status: implemented and verified locally.

## Scope

- Map invalid SSE authority requests through the Gateway HTTP error contract.
- Emit capability invalidation alongside authority invalidation when a grant revision changes.
- Preserve the bounded, authenticated invalidation stream without exposing the unrestricted event bus.

## Evidence

- `test/gateway-http.test.js` verifies an SSE request without an authority context returns a typed 401 response.
- `test/gateway-service.test.js` verifies grant changes invalidate both authority and capability material.
- `npm test`: 52 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
