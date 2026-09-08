# Development Batch 135 — add stable Studio HTTP error codes

## Outcome

Studio and Basic Agent HTTP failures now include a stable top-level `code` alongside the existing human-readable `error` message. Existing UI consumers continue to display the message, while integrations can handle typed outcomes.

## Evidence

- `src/http/dev-server.js` emits codes for authentication, scope, configuration, not-found, limit, and generic request failures.
- `test/studio-http.test.js` verifies not-found and scope-denied responses over a running local HTTP server.
- `npm test` and `npm run validate` pass.

## Boundary

The code is transport metadata and does not grant authority. Studio session/bearer authentication and site scope remain enforced independently.
