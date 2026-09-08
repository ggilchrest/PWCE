# Development Batch 141 — harden HTTP response headers

## Outcome

PWCE’s Studio and Agent Gateway HTTP responses now include consistent browser-hardening headers: MIME sniffing protection, referrer suppression, and a same-origin content-security policy that disallows framing and object content.

## Evidence

- `src/http/security-headers.js` defines the shared response policy.
- `src/http/dev-server.js` and `src/http/gateway-server.js` apply it to JSON, static, and SSE responses.
- `test/gateway-http.test.js` verifies the policy on an authenticated gateway response.
- `npm test` and `npm run validate` pass.

## Boundary

These headers do not authenticate users, select a Studio session mechanism, or change response payloads.
