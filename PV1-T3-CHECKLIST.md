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
| Prepared inputs enforce item and byte bounds | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` |
| Context queries enforce detail and response byte bounds | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` |
| Bounded history continuation uses a source-bound cursor | `pass` | `src/domain/query-service.js`; `test/gateway-service.test.js` |
| Namespaced trace custody preserves gateway provenance without interpretation | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` |
| Development fixture Agent validates the available profile compatibility metadata | `pass` | `src/agent/fixture-external-agent.js`; `test/gateway-http.test.js` |
| Final gateway JSON schema publication and digest | `deferred` | Exact gateway field names and schema identifiers remain an open decision in Section 22 of `PWCE_PERSONAL_V1_AGENT_GATEWAY_PROFILE.md`; the profile reports `schemaStatus: unpublished` and does not claim a digest |
| Profile mismatch, expiry, and cross-site denial | `pass` | `test/gateway-service.test.js` |
| No-effect capability snapshot is explicit | `pass` | `test/gateway-service.test.js` |
| Authenticated HTTP transport binding issues authority and delegates gateway requests | `pass` | `src/http/gateway-server.js`; `test/gateway-http.test.js` |
| Bounded gateway invalidation replay survives service restart | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` — restart replay |
| External fixture Agent compatibility | `pass` | `src/agent/fixture-external-agent.js`; `scripts/pwce-fixture-agent.mjs`; `test/gateway-http.test.js`; local standalone HTTP smoke |
| Lifestream mapping compatibility | `deferred` | Owned by the separate Lifestream repository |
| Effect authorization and dispatch | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js`; `PV1-T4-CHECKLIST.md` |
