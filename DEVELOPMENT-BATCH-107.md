# Development Batch 107 — explicit gateway bundle identity

## Outcome

The published gateway profile now advertises the bundle identity and version in addition to its schema and operation-catalog digests. The fixture Agent and generated client pin and verify all of these values before use.

## Evidence

- `src/gateway/gateway-service.js` publishes `bundleId` and `bundleVersion`.
- `src/agent/fixture-external-agent.js` and `src/gateway/generated-client.js` fail closed on bundle mismatch.
- `test/gateway-http.test.js` and `test/generated-client.test.js` cover the published metadata.
- `npm test` — expected to pass after this slice.
- `npm run validate` — contract validation remains green.
- `git diff --check` — passed.

## Boundary

This completes the PWCE-owned bundle identity. Lifestream still must create and commit its mapping profile, generated integration lock, mapping fixtures, and adapter revision.
