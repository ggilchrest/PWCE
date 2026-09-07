# Development Batch 86 — authorized aggregate Studio context

## Outcome

Studio now offers “All authorized sites” when the session covers multiple Home Assistant sites. The aggregate view shows one current result per site and labels the values as separate. History, explanations, the single-site Basic Agent, and effect controls require an individual site selection.

## Evidence

- `src/domain/observation-service.js` adds the site-qualified aggregate current read.
- `src/http/dev-server.js` accepts authorized multi-site current queries and now issues browser sessions with the full configured site scope.
- `src/studio/app.js` renders the aggregate view and disables single-site operations while it is selected.
- `test/runtime-state.test.js` proves aggregate results retain one value per site.
- Multi-site browser smoke verified the selector contains “All authorized sites”, Home One, and Home Two.
- `docs/user-docs/manual/inspect-local-context.html` and `docs/user-docs/releases/2026-09-07-studio-site-scope.html` describe the boundary.
- `npm test` — 80 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

Aggregate reads require the authenticated Studio session to authorize every requested site. Values are never merged, and aggregate scope cannot be used to preview, approve, explain, or dispatch an effect.
