# PWCE Personal V1 — PV1-T2 local evidence checklist

Status: `passed`

This checklist records site-qualified reads, multi-site aggregation, contradiction handling, and write isolation. Both separately operated local Home Assistant installations now have authenticated read-only synchronization evidence; live effects remain separately protected.

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
| Separately operated second Home Assistant installation | `pass` | `DEVELOPMENT-BATCH-159.md` — authenticated read-only startup sync against `pwce-homeassistant-dev-two`; source became `online` and emitted a site-qualified `light.kitchen_lights` observation |
