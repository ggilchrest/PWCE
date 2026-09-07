# Development Batch 31 — honest unconnected health

Status: implemented and verified locally.

## Scope

- Treat configured, unknown, and otherwise non-online sources as unavailable until they connect.
- Report `healthy` only when every registered source is online.
- Expose the bounded unavailable-source count alongside the existing offline count.

## Evidence

- `test/adapter-and-query.test.js` verifies a configured-but-unconnected source reports degraded health and one unavailable source.
- `npm test`: 45 tests passing.
- `npm run validate`: contract fixture validation passing.

This keeps local health honest and does not claim external provider availability.
