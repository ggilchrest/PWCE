# Development Batch 139 — type gateway connectivity failures

## Outcome

The generated gateway client now exposes stable request and event-stream failure codes when connectivity fails. Abort cancellation remains untouched so callers can distinguish deliberate cancellation from unavailable transport.

## Evidence

- `src/gateway/generated-client.js` maps request failures to `gateway_request_failed` and stream failures to `gateway_stream_failed`.
- `test/generated-client.test.js` covers both connectivity paths.
- `npm test` and `npm run validate` pass.

## Boundary

This classifies transport availability only. It does not retry requests or reinterpret an uncertain operation outcome.
