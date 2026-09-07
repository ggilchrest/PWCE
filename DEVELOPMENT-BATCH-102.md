# Development Batch 102 — material source revisions

## Outcome

Gateway context, prepared-input, and grant results now report a material-state source revision derived from World data rather than the global transaction counter. Audit-only gateway requests no longer create false source changes.

## Evidence

- `src/gateway/gateway-service.js` derives source revision from site, source, entity, observation, and projection state.
- `test/gateway-service.test.js` verifies repeated current reads retain the same source revision.
- `npm test` — 87 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The fingerprint changes when material context changes and does not alter authority, audit retention, or event cursor semantics.
