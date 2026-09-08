# Development Batch 136 — normalize static gateway errors

## Outcome

Gateway profile, bundle, method, configuration, and unknown-route failures now use the typed error envelope. The generated client preserves their stable codes instead of reducing them to generic transport failures.

## Evidence

- `src/http/gateway-server.js` emits `{ error: { code, message } }` for static transport failures.
- Gateway and generated-client tests verify authentication and typed error preservation.
- `npm test` and `npm run validate` pass.

## Boundary

Error metadata describes the transport outcome; it does not authenticate a caller or grant authority.
