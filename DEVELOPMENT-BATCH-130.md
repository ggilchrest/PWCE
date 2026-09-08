# Development Batch 130 — bound gateway JSON responses

## Outcome

The gateway HTTP binding and generated client now enforce the shared 1 MiB limit on JSON responses as well as requests. Oversized responses fail with a typed limit outcome instead of being delivered as successful payloads.

## Evidence

- `src/http/gateway-server.js` bounds serialized JSON responses.
- `src/gateway/generated-client.js` bounds response bytes before JSON parsing.
- HTTP and generated-client tests cover oversized responses.
- `npm test` and `npm run validate` pass.

## Boundary

This limit applies to transport JSON messages. It does not replace bounded artifact-reference handling or the separate SSE frame/reconnect rules.
