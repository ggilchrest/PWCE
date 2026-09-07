# Development Batch 68 — Honest adapter shutdown

Status: implemented and verified locally.

## Scope

- Invalidate Home Assistant token resolution when the adapter closes before socket creation.
- Prevent stopped Studio reconnect work and late adapter callbacks from changing runtime state.
- Record an explicit `studio_stopped` offline status for the configured source.

## Evidence

- `test/real-boundaries.test.js` verifies shutdown prevents socket creation after delayed token resolution.
- `test/studio-http.test.js` verifies stopped Studio remains offline despite late adapter activity.
- `npm test`: 65 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `git diff --check`: passing.
