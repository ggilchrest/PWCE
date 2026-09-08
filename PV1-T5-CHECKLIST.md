# PWCE Personal V1 — PV1-T5 local evidence checklist

Status: `in_progress`

This checklist records the exact current Lifestream integration boundary without claiming Lifestream product, voice-provider, or production acceptance. Core PWCE bundle pinning and a Lifestream consumer handshake are verified at the revisions below; full integrated acceptance remains open.

| Check | Result | Evidence |
|---|---|---|
| Exact PWCE bundle identity, version, digest, and seven artifact pins are published | `pass` | `src/gateway/gateway-bundle.js`; `contracts/gateway/bundle-manifest.json`; `test/gateway-bundle.test.js` — digest `32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2` |
| Lifestream consumer pin matches the current PWCE bundle and generated client | `pass` | Lifestream `implementation/evidence/XR-001-pwce-consumer-reconciliation.json` at revision `0e8b7753553325680a5cc639c9ba2331d30a2f96`; implementation revision `8297cbc571aa776b47459c40185f4971e295ac2f` |
| Lifestream mapping and compatibility tests pass against the current pins | `pass` | Thirteen targeted contract/client/mapping tests, 105 Lifestream workspace tests, strict typecheck, lint, build, and workspace structure check passed |
| Authenticated Lifestream client negotiates the exact profile and bundle before gateway operations | `pass` | `DEVELOPMENT-BATCH-161.md`; the current Lifestream client passed against a disposable local PWCE gateway at PWCE revision `d3ac5c4591c25446f51d9961aef7d24f1a22b0f2` |
| Full core mapping acceptance against the real gateway | `deferred` | Lifestream evidence explicitly does not claim live PWCE adapter acceptance |
| Selected optional gateway profiles | `not_selected` | No optional inference, speech, renderer-host, or plugin-operations profile is selected by the current PWCE tier |
| Lifestream VoxCPM2 development-host evidence | `pass` | Lifestream `implementation/evidence/LS-S029.json` at revision `46fea7c`; deterministic lifecycle, expressive delivery, restart, 384 real synthesis requests, and 19 cancellation probes passed |
| Lifestream VoxCPM2 production acceptance | `deferred` | Final native-Linux production hardware, production voice identity, and subjective emotional-fidelity acceptance remain outside the development-host claim |

The checklist does not claim Lifestream persona, memory, Dreaming, cognition, endpoint, handoff, embodiment, runtime composition, or provider acceptance. Those remain Lifestream-owned outcomes.
