# Development Batch 28 — authority invalidation event scoping

Status: implemented and verified locally.

## Scope

- Associate authority invalidation events with the affected Agent principal.
- Deliver those events to an already-open authority stream without making them visible to unrelated site watchers.
- Preserve the existing fail-closed behavior for requests made with an invalidated context.

## Evidence

- `src/gateway/gateway-service.js` carries principal watch scope on authority invalidation events.
- `npm test`: 43 tests passing.
- `npm run validate`: contract fixture validation passing.

The event stream remains bounded and local; distributed revocation is outside the active development tier.
