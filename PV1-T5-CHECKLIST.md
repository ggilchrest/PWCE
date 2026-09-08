# PWCE Personal V1 — PV1-T5 local evidence checklist

Status: `in_progress`

This checklist records the current Lifestream integration boundary without claiming Lifestream product, voice-provider, or production acceptance. Core PWCE bundle pinning and the refreshed transport client are verified; full integrated acceptance remains open.

| Check | Result | Evidence |
|---|---|---|
| Exact PWCE bundle identity, version, digest, and five artifact pins are published | `pass` | `src/gateway/gateway-bundle.js`; `contracts/gateway/bundle-manifest.json`; Lifestream `implementation/evidence/LS-S046.json` |
| Refreshed Lifestream compatibility lock pins the current PWCE bundle and generated client | `pass` | Lifestream commit `5a04b3e`; Lifestream `packages/contracts/src/pwce/compatibility-lock.ts` |
| Lifestream mapping and compatibility tests pass against the refreshed pins | `pass` | Lifestream commit `3a88ea7`; Lifestream `implementation/evidence/LS-S046.json` — 97 workspace tests and targeted PWCE compatibility tests passed |
| Authenticated Lifestream client negotiates and queries the real local PWCE gateway | `pass` | `DEVELOPMENT-BATCH-118.md`; 3 Lifestream client tests passed against `http://127.0.0.1:4183` |
| Full core mapping acceptance against the real gateway | `deferred` | Lifestream evidence explicitly does not claim live PWCE adapter acceptance |
| Selected optional gateway profiles | `not_selected` | No optional inference, speech, renderer-host, or plugin-operations profile is selected by the current PWCE tier |
| Lifestream VoxCPM2 development-host evidence | `pass` | Lifestream `implementation/evidence/LS-S029.json` at revision `46fea7c`; deterministic lifecycle, expressive delivery, restart, 384 real synthesis requests, and 19 cancellation probes passed |
| Lifestream VoxCPM2 production acceptance | `deferred` | Final native-Linux production hardware, production voice identity, and subjective emotional-fidelity acceptance remain outside the development-host claim |

The checklist does not claim Lifestream persona, memory, Dreaming, cognition, endpoint, handoff, embodiment, or provider acceptance. Those remain Lifestream-owned outcomes.
