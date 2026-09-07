# Development Batch 79 — External Agent gateway client

Status: implemented and verified locally.

## Scope

- Add a fixture external Agent client that negotiates `pwce-agent-gateway.v1` over HTTP.
- Issue a short-lived site-scoped authority context and query current or historical context through the gateway.
- Preserve evidence references and typed gateway failures without accessing PWCE internals or effect paths.

## Evidence

- `test/gateway-http.test.js` verifies profile negotiation, gateway-only request paths, bearer authentication, and evidence-linked output.
- `npm test`: 76 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/agent/fixture-external-agent.js`: passing.
- `git diff --check`: passing.
