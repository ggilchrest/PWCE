# Development Batch 109 — authority profile negotiation

## Outcome

The generated PWCE gateway client now negotiates the published profile before authority-context issuance as well as before ordinary requests and invalidation streams. No client operation can bypass the bundle identity, version, schema digest, or catalog digest checks.

## Evidence

- `src/gateway/generated-client.js` applies the shared profile handshake to `authority()`.
- `test/generated-client.test.js` verifies the authority call order and handshake.
- `npm test` — expected to pass after this slice.
- `npm run validate` — contract validation remains green.
- `git diff --check` — passed.

## Boundary

The client remains transport-only; Lifestream owns the mapping and must still produce its integration lock.
