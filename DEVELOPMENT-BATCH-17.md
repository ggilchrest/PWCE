# Development Batch 17 — Agent Gateway HTTP transport binding

Status: implemented and verified locally.

## Scope

- Add an authenticated `/gateway/v1/` HTTP binding for the existing `GatewayService`.
- Keep workload bearer authentication and short-lived authority contexts separate from Studio browser sessions.
- Support profile discovery, authority issuance, and authenticated gateway requests.
- Keep Home Assistant credentials and Studio Human credentials outside the Agent transport.

## Evidence

- `test/gateway-http.test.js` verifies denied unauthenticated profile access, scoped authority issuance, and delegated `health.get` requests.
- `npm test`: 37 tests passing.
- `npm run validate`: contract fixture validation passing.

This is transport-binding evidence only. Full versioned external-client fixtures, generated schemas, and Lifestream compatibility remain deferred until their exact wire artifacts are authored.
