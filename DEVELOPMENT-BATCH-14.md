# Development Batch 14 — live Home Assistant Studio events

Status: implemented and verified locally.

## Scope

- Keep the real Home Assistant REST startup sync and add the real WebSocket `state_changed` subscription to Studio startup.
- Correct the injected WebSocket factory boundary so tests and local adapters use the intended dependency.
- Close the adapter when the Studio HTTP server closes.
- Preserve normalized observations, provenance, idempotency, and the existing Studio authorization boundary.

## Configuration

`PWCE_STUDIO_LIVE_EVENTS=true` is the default when Home Assistant is configured. Set it to `false` for a read-only startup-sync-only run.

## Evidence

- Existing Home Assistant adapter REST and WebSocket boundary tests remain passing.
- `npm test`: passing after the live-event integration.
- `npm run validate`: contract fixture validation passing.
