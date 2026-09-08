# Development Batch 155 — bound Home Assistant WebSocket handshakes

## Outcome

Home Assistant WebSocket authentication now has a bounded ten-second handshake timeout. A peer that never authenticates moves the adapter to degraded state and rejects the pending connection instead of leaving it unresolved indefinitely.

## Evidence

- `test/real-boundaries.test.js` verifies timeout failure and degraded status.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

The timeout covers connection authentication only. It does not alter event delivery, reconnection policy, or the requirement for independent observation before claiming an effect succeeded.
