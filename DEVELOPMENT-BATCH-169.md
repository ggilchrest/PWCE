# Development Batch 169 — Retained capability snapshots

Status: `verified` for this producer component; PV1-T5 remains `in_progress`.

The Gateway now retains immutable capability snapshots in a bounded process-local registry. Repeated reads under the same complete authority/World/execution scope and source return the original reference and issuance time. Snapshot lookup with an explicit `snapshotRef` rejects unknown, foreign, expired or invalidated references. It never replaces a supplied reference. The existing open V1 operation payload admits this optional reference on `capabilities.getSnapshot` and `capabilities.invoke`; no new operation or schema artifact is introduced. Calls omitting it retain their request format: the trusted Gateway pins a current retained snapshot before admission. This server-selected snapshot is not evidence of prior client review.

Every Gateway invocation checks membership/version in the retained catalog and rechecks its binding before admission, in the serialized admission/dispatch guards, and immediately before target I/O. The source digest includes the catalog, configured target identity and live-effect configuration. The selected current authority context independently checks principal/grant revision, full identity scope and expiry. Catalog or World changes permanently invalidate observed prior references; restoring old content cannot revive them. Source-change detection also emits the existing capability invalidation event. Delayed or lost events do not bypass the synchronous dispatch guard.

The registry defaults to 256 retained entries, with a trusted range of 1–1024, a 16 KiB source catalog limit and 32 KiB retained evidence limit. It removes expired entries when acquiring a new snapshot; capacity fails rather than evicting an unexpired entry. Snapshot contexts are process-local because Gateway authority contexts are process-local; restart requires fresh authority and discovery. The existing sourceRevision/invalidationSequence fields retain their V1 grant-revision meaning. Full source/content binding is in the retained record and unique snapshot reference, not a claim that grant revision alone identifies the catalog.

Each new admitted Gateway action atomically stores the original snapshot bytes, full captured scope, source digest and SHA-256 alongside its action/audit admission. Later action reads check that custody. Missing or corrupt bytes cannot support a recorded result. A dispatch of a snapshot-bound admission requires the original trusted live snapshot guard; a direct call or restart cannot turn the stored reference into a bearer permission. A duplicate Gateway command returns its original disposition without dispatching again, including when the original action was interrupted in the admitted state. Status reconciliation remains the separate existing read path.

## Validation

- `npm test`: 209 tests pass, including 13 new snapshot cases and the updated authenticated HTTP action test.
- `node --test test/capability-snapshots.test.js`: 13 focused tests pass. Coverage includes immutable/reused identity, malformed/missing/foreign references, catalog membership, retained byte integrity, bounded capacity, time/authority changes, source changes before and after admission, restart, interrupted duplicate handling, and no revival after catalog/World restoration.
- `npm run validate`: 13 fixtures and 3 manifest checks pass. Published bundle artifacts and generated-client pins are unchanged and checked by the source suite.
- Documentation checks: 29 HTML pages pass link, anchor, screenshot, alt-text, shared-style, feature-map, manual-index and affected-QA release checks. No screen layout changed or screenshot recapture was required.
- `git diff --check`: passed.

These are isolated synthetic component and HTTP tests, not real-device, selected-provider, Human or full Lifestream canonical acceptance. The initial focused test log contains a corrected harness digest-order expectation; it is not a demonstrated pre-change product regression.

## Remaining work

Continue the actual canonical Lifestream capability/authority adapter, host scope and grant UI/dispatch integration. PWCE target-state preconditions and Gateway-scoped Human approval transport remain unfinished, followed by complete joint action scenarios. Registry contents are not a persistent capability catalog, and the existing StateStore guarantee is single-writer. No saved service was restarted; no deployment, live configuration/effect, personal-data import, training or model/provider selection occurred. Historical evidence, SYNPRJ_Q7M4 telemetry and approved schema bytes remain unchanged.

The enclosing commit binds implementation, tests and documentation relative to producer baseline `bf4248cbbf31764fe1935788ecde7eee61f0c5c8`. Logs are retained privately under `lifestream/.lifestream/benchmarks/pwce-snapshots/2026-09-15` in the composition workspace. The Lifestream receipt records the exact published producer revision and separate-process consumer results.

## Evidence digests

- `pwce-snapshots-full-4.log`: `2aec7ee30f6d3dec219f67509731860740861b70410a360ece0c3d8b5971757a`
- `pwce-snapshots-focused-4.log`: `5b977b64d9592d9012979054761e0e3c1d1cd54cea1fcd3b3000260ef53d00c2`
- `pwce-snapshots-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-snapshots-docs.log`: `a080f8b68190bbacedc3da3bc2e89dc3429ccbb571751a61a06bebe7d95c3e40`
