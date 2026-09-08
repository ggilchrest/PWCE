# Development Batch 148 — declare credential-aware responses

## Outcome

PWCE HTTP responses now declare `Vary: Authorization, Cookie` alongside the shared browser-hardening policy. This prevents credential-sensitive responses from being treated as interchangeable by an intermediary cache.

## Evidence

- `src/http/security-headers.js` adds the shared `Vary` declaration.
- `test/gateway-http.test.js` verifies it on an authenticated gateway response.
- `npm test` and `npm run validate` pass.

## Boundary

This is a cache-key declaration only. It does not provide authentication, select a session mechanism, or change payloads.
