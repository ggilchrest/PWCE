# Development Batch 39 — gateway operation catalog

Status: implemented and verified locally.

## Scope

- Publish the required core gateway operation names through authenticated profile discovery.
- Include operation kind, current availability, catalog version, and catalog digest.
- Identify trusted-dispatch-only and deferred operations without pretending they are callable.

## Evidence

- `test/gateway-http.test.js` verifies authenticated profile discovery exposes the operation catalog and digest.
- `npm test`: 49 tests passing.
- `npm run validate`: contract fixture validation passing.

Exact JSON Schemas, generated validators, and optional profiles remain deferred until their wire artifacts are authored.
