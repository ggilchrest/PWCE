# Development Batch 70 — Local Basic Agent

Status: implemented and verified locally.

## Scope

- Add a deterministic, offline-capable Basic Agent that answers current and recent-history questions through `pwce-agent-gateway.v1`.
- Keep the Agent read-only with no approval or effect authority.
- Add secured Studio `/api/agent` and `/api/agent/message` routes and a visible “Ask the home” panel.
- Document the new user journey and QA acceptance checks.

## Evidence

- `test/gateway-service.test.js` verifies current and historical answers include gateway-backed evidence references.
- `npm test`: 67 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `node --check src/agent/basic-agent.js`: passing.
- Local HTTP smoke: `/api/session` authenticated and `/api/agent/message` returned a known, evidence-linked current answer.
- `git diff --check`: passing.
