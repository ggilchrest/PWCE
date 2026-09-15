# Development Batch 164 — isolated Lifestream context mapping fixture

## Result

The existing disposable Gateway fixture now has an explicit `PWCE_FIXTURE_SCENARIO=qualified-context` scenario. It seeds only in-memory synthetic observations: conflicting booleans, stale evidence, a short history and a separately scoped foreign site. The default `empty` scenario remains available. Readiness exposes the synthetic historical boundary and scenario name but never the token. The same 60-second lifetime and explicit stdin/interrupt shutdown remain.

The Lifestream-owned `scripts/check-pwce-context-process.mjs` starts the producer CLI in a separate process, supplies a generated synthetic token, invokes consumer checks exclusively through HTTP and shuts down the fixture. It does not import producer modules. The mapped read component preserves qualification and scope across prepared/current/explain/history/as-of/search/evidence responses. History and entity search remain separate from current facts; authority/request and execution-mode bindings are checked; observation environment and producer-reported integrity remain distinct from the current request.

## Validation

- `npm test`: all 147 producer tests passed after the fixture scenario was added.
- `npm run validate`: thirteen foundation fixtures and three manifest checks passed. No published bundle, generated client or schema artifact changed.
- From Lifestream, `node scripts/check-pwce-context-process.mjs`: thirteen actual HTTP context checks passed. These include old conflict value withholding, as-of selection independent of history pages, per-site known/unknown subjects, authorized evidence expansion and rejection of a known foreign evidence reference.
- The default empty scenario also passed the five explicit HTTP authentication checks and twenty-six Lifestream contract/client/mapping cases. Negative/parser cases intentionally using mocked responses remain fixture proof.
- Lifestream's full suite passed 438 source tests, including ten new mapping tests; 44 focused adapter/client/transport/mapping tests and 45 tooling tests passed. Typecheck, lint, build and private-spec validation passed. The runtime does not yet instantiate this mapped provider.
- The updated manual and QA journey explain the single fixture command, its isolated data and limited claim. Twenty-three HTML pages passed link, anchor, image, alt-text, stylesheet and index checks. The linked release note covers the changed QA script; Studio controls/layouts did not change.

## Evidence digests

- `scripts/gateway-fixture-server.mjs`: `ac094fea30dea1fe242433ac2db475a8c930be248942c1f12cf597d7f6615fcb`
- `pwce-mapping-process.log`: `e8444cd22c8c717305be495e5740a87cb62d4008d0f1e3e1f02d9fee1690f564`
- `pwce-mapping-default-network.log`: `858181b695805ae54b807a18d0aedc981a335199174d78f0fd6f7a0fd5dfd0cc`
- `pwce-mapping-default-client.log`: `6fba00643a2171bfb16e76c4bcdd23b70060bbcf2119376041e57de14ab9c341`
- `pwce-mapping-producer-tests.log`: `04a6df50df1ccf4fc3838186857b5d5cd69570dcd0b598cbdbf0aa636c4980c0`
- `pwce-mapping-producer-contracts.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-mapping-producer-docs.log`: `9774b2f872678821b1b71943e6b8518cad97950a0cf97b75b4d9b61158921b71`
- `pwce-mapping-source.log`: `b275211e6abd0e48da479679b399dca56e79ac29698533f77a5b28be5fa81e2c`
- `pwce-mapping-focused-final.log`: `bcde22ba65c218722a8c47762412a3a8183d8f5f9fcdc6b4a7b418f4d08d83a1`
- `pwce-mapping-tooling.log`: `077bd1f0a7fa7a001bfad155c04efd96364baf8883eb48cdac75c149de828a1c`

## Remaining boundary

This is a verified read-mapping component and a reproducible producer fixture, not full PV1-T5 acceptance. Scope-bound SSE identities/mode, ordered invalidation/cache recovery, runtime async provider/authority/capability wiring, final full mapping-profile fixture/digest qualification and joint scenarios remain open in their owning components. No saved state, Home Assistant connection, live configuration, deployment, model selection, training, personal-data import or Human acceptance was changed.
