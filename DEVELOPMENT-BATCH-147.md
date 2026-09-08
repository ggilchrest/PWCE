# Development Batch 147 — protect Studio session bootstrap

## Outcome

When `PWCE_STUDIO_TOKEN` is configured, `/api/session` now requires the matching bearer token before issuing a browser session. The unconfigured local development path remains available for the explicitly local test setup.

## Evidence

- `src/http/dev-server.js` authenticates configured session bootstrap requests before creating a session.
- `test/studio-http.test.js` covers denied and authorized bootstrap.
- `docs/user-docs/qa/inspect-local-context.html` and the release note describe the changed behavior.
- `npm test` and `npm run validate` pass.

## Boundary

This closes the current bearer-bootstrap gap. It does not select the final V1 authentication/session profile governed by the open specification decision.
