# PWCE Personal V1 — PV1-T1 local evidence checklist

Status: `passed`

This checklist records the implemented local Home Assistant state path, user-facing Home Status flow, and restart/reconnect evidence for T1. Production availability and backup custody remain outside this local checklist.

| Check | Result | Evidence |
|---|---|---|
| Versioned local state initializes and migrates | `pass` | `src/runtime/state-store.js`; `test/runtime-state.test.js` |
| State survives process/store reload | `pass` | `test/runtime-state.test.js` — reload test |
| Site-qualified source and entity identity | `pass` | `src/domain/identity.js`; `test/runtime-state.test.js` |
| Observation retains source, event time, receipt time, and provenance | `pass` | `src/domain/observation-service.js`; `test/runtime-state.test.js` |
| Out-of-order history is retained without regressing current projection | `pass` | `test/runtime-state.test.js` — ordering test |
| Duplicate observation admission is idempotent | `pass` | `test/runtime-state.test.js` — idempotency test |
| Deterministic Home Assistant fixture adapter | `pass` | `src/adapters/home-assistant-fixture.js`; `test/adapter-and-query.test.js` |
| Adapter online/offline health transitions | `pass` | `src/runtime/health.js`; `test/adapter-and-query.test.js` |
| Current, History, as-of, and evidence explanation queries | `pass` | `src/domain/query-service.js`; `test/adapter-and-query.test.js` |
| Real Home Assistant adapter | `pass` | `src/adapters/home-assistant-adapter.js`; live local read-only sync passed |
| Initial state sync and live WebSocket subscription | `pass` | `DEVELOPMENT-BATCH-07.md` — two-entity sync and WebSocket authentication passed |
| User-facing Home Status flow | `pass` | `src/studio/`; `src/http/dev-server.js`; `docs/user-docs/manual/inspect-local-context.html` |
| Offline/reconnect behavior | `pass` | `src/runtime/reconnect-policy.js`; `DEVELOPMENT-BATCH-16.md`; `test/reconnect-policy.test.js` |
| Restart preserves completed Actions and idempotency without a second target call | `pass` | `test/action-service.test.js` — restart recovery test |
