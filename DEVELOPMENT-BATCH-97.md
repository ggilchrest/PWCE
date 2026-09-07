# Development Batch 97 — secondary-site reconnects

## Outcome

Every configured Home Assistant site now receives bounded live reconnect handling. Secondary sites no longer make a single connection attempt and then remain silently degraded; they use the same configured backoff and attempt ceiling as the primary site.

## Evidence

- `src/studio/studio-service.js` supervises secondary adapter connections and cancels timers on stop.
- `test/studio-http.test.js` verifies a secondary connection retries once under a bounded zero-delay policy.
- `npm test` — passing.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

Reconnects reuse the configured site-specific adapter and token reference. They do not widen site authority, retry indefinitely, or enable effects.
