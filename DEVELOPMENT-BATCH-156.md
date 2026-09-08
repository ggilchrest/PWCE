# Development Batch 156 — configure Home Assistant transport bounds

## Outcome

The development profile can now configure bounded Home Assistant REST and WebSocket handshake timeouts through `PWCE_HA_REQUEST_TIMEOUT_MS` and `PWCE_HA_WEBSOCKET_TIMEOUT_MS`. Both default to ten seconds and reject values outside one millisecond through five minutes.

## Evidence

- `test/reconnect-policy.test.js` covers valid values and malformed/out-of-range values.
- `.env.example` exposes both settings beside reconnect configuration.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

These settings bound adapter transport work in the local development profile. They do not establish production latency objectives or change effect reconciliation semantics.
