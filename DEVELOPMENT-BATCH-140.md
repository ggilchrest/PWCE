# Development Batch 140 — type gateway body-read failures

## Outcome

The generated gateway client now classifies failures that occur after a response or event stream is opened but while its body is being read. Request and stream failures retain separate stable codes.

## Evidence

- `src/gateway/generated-client.js` maps JSON-body read failures to `gateway_request_failed`.
- `src/gateway/generated-client.js` maps SSE reader failures to `gateway_stream_failed` while preserving typed limit errors and aborts.
- `test/generated-client.test.js` covers both post-connect failure paths.
- `npm test` and `npm run validate` pass.

## Boundary

This classifies transport failure only. It does not retry requests or claim an uncertain operation succeeded.
