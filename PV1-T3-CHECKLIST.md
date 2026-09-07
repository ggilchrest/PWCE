# PWCE Personal V1 — PV1-T3 local evidence checklist

Status: `in_progress`

| Check | Result | Evidence |
|---|---|---|
| Authenticated principal registration | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` |
| Short-lived site-scoped authority context | `pass` | `test/gateway-service.test.js` |
| Gateway request identity and world/execution boundary are explicit | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` — request boundary validation |
| Optional Assistant, endpoint, participant, and audience identities stay independently bound | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` — audience identity binding |
| Read-only context and evidence operations | `pass` | `test/gateway-service.test.js` |
| Prepared inputs and bounded grant view | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` |
| Profile mismatch, expiry, and cross-site denial | `pass` | `test/gateway-service.test.js` |
| No-effect capability snapshot is explicit | `pass` | `test/gateway-service.test.js` |
| Authenticated HTTP transport binding issues authority and delegates gateway requests | `pass` | `src/http/gateway-server.js`; `test/gateway-http.test.js` |
| Bounded gateway invalidation replay survives service restart | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` — restart replay |
| External fixture Agent compatibility | `pass` | `src/agent/fixture-external-agent.js`; `scripts/pwce-fixture-agent.mjs`; `test/gateway-http.test.js`; local standalone HTTP smoke |
| Lifestream mapping compatibility | `deferred` | Owned by the separate Lifestream repository |
| Effect authorization and dispatch | `deferred` | Activated by PV1-T4 |
