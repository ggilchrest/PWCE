# PWCE Personal V1 — PV1-T0 local evidence checklist

Status: `passed`

This checklist records the contract-foundation evidence. Later-tier implementation and acceptance evidence is maintained in the PV1-T1 through PV1-T4 checklists.

| Check | Result | Evidence |
|---|---|---|
| Active profile and first tier are pinned | `pass` | `src/contract-foundation/contract-foundation.js`; `test/contract-foundation.test.js` |
| Shared envelope positive and negative vectors execute | `pass` | `npm test` — 4 tests passed |
| Producer integrity vectors execute | `pass` | `npm test` — positive, tampered, and malformed-envelope vectors passed |
| Contract-pack byte digests match the supplied Draft manifest | `pass` | `npm run validate` — 3 manifest checks and 13 fixture vectors passed |
| Database migrations | `not_applicable` | No database is introduced in PV1-T0 |
| Home Assistant fixture or real adapter | `pass` | `PV1-T1-CHECKLIST.md`; `test/adapter-and-query.test.js`; `test/real-boundaries.test.js` |
| Gateway compatibility | `pass` | `PV1-T3-CHECKLIST.md`; `test/gateway-service.test.js`; `test/gateway-http.test.js` |
| Effect-safety negatives | `pass` | `PV1-T4-CHECKLIST.md`; `test/action-service.test.js`; `test/real-boundaries.test.js` |
| Restart and backup/restore | `pass` | `PV1-T1-CHECKLIST.md`; `test/runtime-state.test.js`; `test/action-service.test.js` |

Known boundary: the upstream machine-readable manifest and fixtures are Draft artifacts from the private specification repository. A digest mismatch is reported as a validation failure; it is not silently rewritten.
