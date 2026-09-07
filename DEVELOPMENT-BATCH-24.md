# Development Batch 24 — bounded live gateway SSE subscription

Status: implemented and verified locally.

## Scope

- Keep the gateway’s bounded cursor replay as the initial SSE response.
- Hold real HTTP connections open for live site-filtered invalidation events.
- Publish context invalidation, provider degradation, and Action update events without exposing raw internal audits.
- Close idle development connections after thirty seconds and clean up on client disconnect.
- Preserve deterministic short-lived behavior for non-server test bindings.

## Evidence

- `test/gateway-http.test.js` continues to verify SSE formatting through the deterministic binding.
- `test/gateway-service.test.js` verifies cursor-based site-scoped replay and provider degradation events.
- `npm test`: 41 tests passing.
- `npm run validate`: contract fixture validation passing.

The timeout, full event-family coverage, and compatibility artifacts remain development defaults until the final wire profile is authored.
