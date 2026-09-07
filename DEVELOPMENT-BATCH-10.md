# Development Batch 10 — local HTTP gateway and Studio surface

Status: implemented locally; user documentation map approval pending.

## Scope

- Add a loopback-only HTTP server for runtime health, current context, history, capabilities, action preview, durable approval requests, approval decisions, dispatch, and action lookup.
- Add a no-build Studio UI for the local Home Assistant context and the reversible light action boundary.
- Keep live effects disabled unless `PWCE_ENABLE_LIVE_EFFECTS=true` is explicitly set.
- Keep the Home Assistant token in an environment-backed secret reference; never put it in the UI bundle or persisted state.
- Require an environment-backed `PWCE_STUDIO_TOKEN` for direct API clients; the browser UI uses a short-lived in-memory local session cookie.

## Evidence

- `npm test`: 30 tests passing.
- `npm run validate`: contract fixture validation passing.
- Loopback smoke: `/api/health` returned the local runtime state; `/` returned HTTP 200; `/api/context/current` returned an honest unknown state with no observation.
- UI design contract: `DESIGN.md`.

## Feedback gate

The documentation bootstrap requires approval of the initial journey grouping before `docs/user-docs/` is created. Proposed map: one journey, “Inspect local context and request a safe action,” with the Studio page and its HTTP API as the entry points. The journey covers health, evidence, preview, approval, and the explicit live-effect boundary.
