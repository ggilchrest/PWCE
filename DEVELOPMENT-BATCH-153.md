# Development Batch 153 — protect cookie-authenticated mutations

## Outcome

Studio now rejects cross-origin POST mutations made with a browser session cookie. Same-origin browser requests and requests without an `Origin` header remain valid for local tooling; bearer-authenticated API calls are not changed.

## Evidence

- `test/studio-auth.test.js` covers same-origin, absent-origin, cross-origin, and malformed-origin decisions.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

This is a local same-origin request check. It is not a substitute for TLS, host hardening, or production identity and credential custody.
