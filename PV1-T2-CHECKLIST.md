# PWCE Personal V1 — PV1-T2 local evidence checklist

Status: `in_progress`

This checklist records site-qualified reads, multi-site aggregation, contradiction handling, and write isolation. The second-site evidence below uses the deterministic Home Assistant fixture and optional local-site configuration. A separately operated second Home Assistant installation remains deferred.

| Check | Result | Evidence |
|---|---|---|
| Second site registers with a site-qualified source identity | `pass` | `src/studio/studio-service.js`; `test/studio-http.test.js` — optional second-site registration |
| Site-qualified identities prevent cross-site entity collisions | `pass` | `src/domain/identity.js`; `test/runtime-state.test.js`; `test/gateway-service.test.js` |
| Authorized multi-site current reads return site-qualified items without merging | `pass` | `src/gateway/gateway-service.js`; `test/gateway-service.test.js` — multi-site current query |
| Studio exposes an explicit aggregate read without enabling aggregate effects | `pass` | `src/studio/app.js`; `src/http/dev-server.js`; `test/runtime-state.test.js` — aggregate current read |
| Site-scoped search does not leak matches from another authorized site | `pass` | `test/gateway-service.test.js` — requested site selector |
| History, as-of, and explanation reads remain site-scoped | `pass` | `src/domain/query-service.js`; `test/adapter-and-query.test.js`; `test/gateway-service.test.js` |
| Same-time conflicting observations are explicit rather than silently resolved | `pass` | `src/domain/observation-service.js`; `test/runtime-state.test.js`; `test/gateway-service.test.js` |
| Cross-site action attempts fail before an external effect | `pass` | `src/actions/home-assistant-target.js`; `test/studio-http.test.js`; `test/gateway-service.test.js` |
| Separately operated second Home Assistant installation | `deferred` | `pwce-homeassistant-dev-two` is healthy on `127.0.0.1:8124` and returns the expected unauthenticated `401`; its separate onboarding and token are still required before authenticated live-sync evidence can be claimed |
