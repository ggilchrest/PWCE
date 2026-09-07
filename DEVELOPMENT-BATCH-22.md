# Development Batch 22 — bounded gateway invalidation replay

Status: implemented and verified locally.

## Scope

- Add state-store subscriptions for internal change observation.
- Publish bounded `context.invalidated` events when observations are accepted.
- Add site-scoped cursor replay with limits and explicit resynchronization signaling.
- Keep the stream separate from the unrestricted state/event bus.

## Evidence

- `test/gateway-service.test.js` verifies cursor-based replay and site scoping.
- `npm test`: 40 tests passing.
- `npm run validate`: contract fixture validation passing.

The final SSE framing, complete multiplexed event families, and compatibility artifacts remain deferred until their exact wire contract is authored.
