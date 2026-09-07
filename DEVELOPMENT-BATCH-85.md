# Development Batch 85 — site-qualified Studio inspection

## Outcome

Studio now lists the Home Assistant sites authorized for the current browser session. Selecting a site carries that scope through current context, History, explanations, Basic Agent questions, and action requests. The server exposes only authorized site identities and source health through `/api/sites`.

## Evidence

- `src/http/dev-server.js` adds the authorized site-listing helper and `/api/sites` route.
- `src/studio/index.html`, `src/studio/app.js`, and `src/studio/styles.css` add the site selector and scope-aware requests.
- `test/studio-http.test.js` verifies that only authorized sites and their source references are listed.
- `docs/user-docs/manual/inspect-local-context.html` and `docs/user-docs/qa/inspect-local-context.html` document the complete site-selection flow.
- `docs/user-docs/assets/screenshots/inspect-local-context/inspect-local-context-01-studio-overview.png` was recaptured from the running Studio.
- `npm test` — 79 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `docker compose -f docker-compose.dev.yml config --quiet` — passed.
- `git diff --check` — passed.

## Safety boundary

The selector does not broaden authority. The server derives its list from the authenticated Studio scope, and action requests continue to pass through the existing site and capability checks.
