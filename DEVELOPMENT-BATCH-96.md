# Development Batch 96 — preserve Studio history cursors

## Outcome

The local Studio history transport now returns the complete bounded history result, including `hasMore`, `nextCursor`, and limitations. The existing Studio timeline continues to render the returned observations, while callers can now continue a history query without losing the cursor at the HTTP boundary.

## Evidence

- `src/http/dev-server.js` forwards the history result instead of reducing it to an array.
- `src/studio/app.js` consumes `observations` while preserving the richer transport result.
- `npm test` — passing.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The browser receives only the same site-scoped, bounded observations and cursor issued by the query service. This change does not widen Studio authority or merge site histories.
