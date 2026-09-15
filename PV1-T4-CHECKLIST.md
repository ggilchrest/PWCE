# PWCE Personal V1 — PV1-T4 local evidence checklist

Status: `passed`

| Check | Result | Evidence |
|---|---|---|
| Reversible capability descriptor and snapshot | `pass` | `src/actions/action-service.js`; `test/action-service.test.js` |
| Deterministic grant preview | `pass` | `test/action-service.test.js` |
| Separate action admission and dispatch | `pass` | `test/action-service.test.js` |
| Idempotent replay and conflicting-input rejection | `pass` | `test/action-service.test.js` |
| Observed successful fixture outcome | `pass` | `test/action-service.test.js` |
| Timeout and `outcome_unknown` remain explicit | `pass` | `test/action-service.test.js` |
| Live route cannot be reached | `pass` | `test/action-service.test.js` |
| Real Home Assistant reversible capability | `pass` | Batch 09 live `light.kitchen_lights` test and restoration both reconciled successfully |
| Local approval record and exact-action binding | `pass` | `src/actions/approval-service.js`; `test/real-boundaries.test.js` |
| Action admission verifies approval before dispatch | `pass` | `test/action-service.test.js` |
| Runtime Human approval transport | `pass` | `src/actions/approval-service.js`; secured Studio approval routes in `src/http/dev-server.js`; `docs/user-docs/qa/inspect-local-context.html` |

## Current action-boundary correction — 2026-09-15

`DEVELOPMENT-BATCH-167.md` records six reproduced gaps and the current 176-test producer result, including durable attempt fencing, scoped approval/status identity, failed-write isolation and bounded uncertainty. Earlier rows remain historical evidence at their stated scope. Full cross-Assistant integration is tracked in PV1-T5. No new live-device or Human acceptance is claimed.
