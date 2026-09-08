# Development Batch 134 — share JSON transport bounds across HTTP surfaces

## Outcome

PWCE now uses one bounded JSON body reader for the Agent Gateway, Studio, and Basic Agent HTTP surfaces. All three reject oversized request bodies before parsing, and JSON responses retain the same 1 MiB limit.

## Evidence

- `src/http/json-body.js` centralizes UTF-8 byte counting, `Content-Length` preflight, and typed parse/limit errors.
- `src/http/gateway-server.js` and `src/http/dev-server.js` use the shared reader and response bound.
- `test/json-body.test.js` covers bounded, declared-oversize, actual-oversize, and malformed inputs.
- `npm test` and `npm run validate` pass.

## Boundary

This governs JSON transport messages only. SSE framing retains its separate line/event handling and the same byte ceiling; durable artifacts remain reference-based.
