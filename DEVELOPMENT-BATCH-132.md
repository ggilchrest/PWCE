# Development Batch 132 — preflight gateway content length

## Outcome

The gateway HTTP binding now rejects a declared request body larger than 1 MiB before consuming or parsing the request stream, while retaining the streaming byte-count guard for missing or inaccurate declarations.

## Evidence

- `src/http/gateway-server.js` checks `Content-Length` before body iteration.
- `test/gateway-http.test.js` covers an oversized declared length.
- `npm test` and `npm run validate` pass.

## Boundary

The declared length is only an early rejection hint; actual bytes are still counted because transport metadata may be absent or inaccurate.
