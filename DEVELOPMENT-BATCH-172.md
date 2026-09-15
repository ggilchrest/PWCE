# Development Batch 172 — Separate trusted admission from invocation

Status: `verified` for the internal producer prerequisite; configured Lifestream authority/capability integration remains `inProgress`.

The trusted host can now admit an exact scoped action through `GatewayService.requestTrustedDispatch` without invoking the target, then explicitly invoke that original admitted action. Both phases use the actual PWCE authority context, producer grant, approval, retained snapshot and normalized request. The response preserves the stored producer admission and original decision. It is not a manufactured Lifestream authority receipt or an effect confirmation.

Invocation resolves an existing action before any mutation and never calls admission. It checks the original action reference, normalized fingerprint (including stored arguments), identity/world/environment, idempotency key, approval requirements/reference and exact retained snapshot. The producer dispatcher retains its durable single claim, current authority/snapshot/deadline guards, fresh preconditions and approval recheck. Eight simultaneous calls produce one synthetic target invocation. Lost replies remain unknown on retries.

The ordinary Agent HTTP binding does not expose the internal method. Its authorization call remains `trusted_dispatch_only`; JSON fields or extra arguments cannot enable the trusted path. The ordinary combined invocation keeps its historical duplicate-as-read behavior, so it cannot start a separately admitted action. There is no new endpoint, configured credential, or public bundle change.

A fresh Gateway context or process cannot reconstruct the old snapshot custody to send an admitted action. Repeated admission can return its historical record, but a replacement snapshot cannot dispatch it. This is conservative recovery fencing, not completion of cross-process admission recovery.

## Validation

- `npm test`: 255 tests pass, zero failures or skips, including 14 new trusted-path cases and all existing HTTP, approval, action, precondition, reconciliation, bundle and compatibility regressions.
- New negative cases cover false trusted flags, wrong credentials, absent snapshot/action, changed input/key/target/approval, another valid audience context, replaced grants (including during the admission read), changed provider source, expired authority, original deadline extension attempts, approval expiry after admission, changed stored arguments, and reconstructed context after a Gateway replacement.
- `npm run validate`: 13 fixtures and three manifest checks pass.
- `npm run generate:gateway-bundle`: byte-identical existing bundle and generated client. Bundle digest remains `32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2`.
- `git diff --check`: pass.

The first new foreign-context test accidentally requested its fresh snapshot with the old context's snapshot reference and correctly received `snapshot_unavailable`. The test now omits that reference when obtaining the other audience's snapshot, then verifies that the original action is rejected. That failed harness log is preserved separately. No runtime guard was weakened.

## Limits and continuation

This increment is an internal backend prerequisite with no changed user interface or ordinary HTTP behavior; the documentation standard's backend-only exemption applies. Developer usage and boundaries are documented in `docs/trusted-dispatch-boundary.md`.

The separately authenticated trusted remote transport, versioned producer contract publication/consumer lock, canonical Lifestream authority/capability and admission-evidence mapping, and joined action tests remain open. No full PV1-T5, configured adapter, physical effect, selected-provider, performance or Human acceptance claim is made. The synthetic approval unit test supplies host proof directly; existing real password/HTTP approval regressions also pass, but neither represents a Human acceptance decision.

No saved service restart, deployment, live configuration change, real device command, personal-data import, training or provider/model selection occurred. The store remains single-writer; fingerprint and snapshot checks detect inconsistent records, not coordinated malicious database rewriting. The SYNPRJ_Q7M4 telemetry was not rerun or modified.

Source baseline: `1518b5fb179d7c7406f6697367bdef23545c1f24`. The enclosing commit binds this implementation. Raw logs are retained locally under `lifestream/.lifestream/benchmarks/pwce-trusted-dispatch/2026-09-15` in the composition workspace.

## Source SHA-256

- `src/gateway/gateway-service.js`: `a8504f35d6c3ed659bceb1aca9f75aef9e8a30763a0cddffd473275d5198f574`
- `test/gateway-trusted-dispatch.test.js`: `b4513ba204932a3b5536dea6216e87667d546109c3fdcb525ed62ff090e2ff6d`
- `docs/trusted-dispatch-boundary.md`: `867d3063c12bc68afa7568964b321ccd0fd302d36f7105ffae49566cff01bfd8`

## Log SHA-256

- `pwce-trusted-dispatch-bundle.log`: `45fe2ceba9163ec01a876ec5d733d3fdcff413171e999a0645f26ef1288c048d`
- `pwce-trusted-dispatch-fixture-scope-failure.log`: `ff0b18e663fe1216245d789d5390ca063018228d7a62979f420bd3ce5b4d677b`
- `pwce-trusted-dispatch-full.log`: `1296a3a464715347e9c4c7c63f1d88346acdad41cebf7f472a848f45656c69b2`
- `pwce-trusted-dispatch-tests.log`: `e96631575aa663e8a6a672f4b93c37a09d1d5ca300ddb992e8293a7b0326eced`
- `pwce-trusted-dispatch-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
