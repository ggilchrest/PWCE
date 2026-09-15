# Development Batch 167 — Action admission and interruption recovery

## Result

Status: `verified` for this producer component; PV1-T5 remains `in_progress`.

Six regressions were reproduced against producer revision `4eab678b22c651b040b630652bcf3999a8631283` using a disposable source archive: requested capability version dropped, authority not rechecked after audit, environment omitted from approval identity, duplicate dispatch across service owners sharing one store, restart redispatch of an unfinished attempt, and inconsistent denied-action return shape. All six failed before correction and pass now. The initial reproduction used a token shorter than the existing authentication minimum; the corrected baseline log supplies the actual failure evidence.

The gateway now preserves the requested version and immutable arguments, checks current authority and deadline after audit and at admission/dispatch boundaries, and scopes status to the original World, execution environment, Assistant, endpoint, participants and audience. Approval and idempotency share normalized version and scope identity. Preview still neither admits nor dispatches, and external authorizeDispatch remains restricted to trusted dispatch.

Action start is committed before the target call. A second owner or restored process cannot repeat a recorded attempt. Missing legacy deadlines and stale grants deny dispatch; approval is rechecked after the start write. Target waits are bounded by a maximum 30-second admission deadline. A timeout after crossing the target boundary remains unknown even if the target ignores cancellation or replies later. Newer reconciliation is not overwritten by a delayed dispatch reply. Brightness input must contain exactly one finite level between zero and one and a bounded target. Failed candidate persistence no longer exposes an uncommitted state in memory.

## Compatibility

The published wire bundle, seven artifact digests and generated client are unchanged. The bundle tests verify the current `32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2` pin. Existing approvals with weaker fingerprints require fresh approval. Existing completed results remain historical; older admissions without a dispatch deadline cannot execute. Status calls must send the invocation's execution mode and identity scope. No stored receipt is rewritten green.

This is a single-writer modular-monolith store guarantee, not independent concurrent JSON-file writers. An unknown action requires reconciliation; a new identity is not permission for a blind repeat. Full capability envelopes, snapshot/precondition binding, gateway-scoped approval transport and Lifestream authority/action mapping remain separate work.

## Validation

- `npm test`: 176 tests passed, including 20 new regressions and an actual synthetic loopback HTTP scenario. No Home Assistant target was called.
- `npm run validate`: 13 contract fixtures and 3 manifest checks passed.
- Lifestream `node scripts/check-pwce-context-process.mjs`: 19 context/cache/stream and 7 authenticated conversation checks passed against the modified producer.
- Documentation validation: 27 HTML pages passed links, anchors, images, alt text, shared CSS, feature map, index and affected-QA release checks. No UI layout changed.
- `git diff --check`: passed.
- The compatibility CLI requires a producer-format lock. The supplied composition candidate uses another format and was rejected; this does not establish or update full joint compatibility. Existing compatibility negative tests and immutable bundle tests pass in the suite. The attempted command logs are preserved.

## Evidence digests

- `pwce-action-boundaries-baseline-corrected.log`: `e1d99e0f6d9f47468fea6ef4ba7839b29fcc4b881b08b75df7a5ac4a76d808f2`
- `pwce-action-boundaries-final.log`: `6296be2d86dac78f5bff8f90d0e8b631e18306314d654eb7c12572d0c97b7fa5`
- `pwce-action-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-action-docs.log`: `1cbaa8b56fb0b42baa9fa5851e3b66a517eac7146293b7ad334a34d04a8ee480`
- `pwce-action-ls-process.log`: `b3e9f658fb01dcb553d5cddb7e682569dd0aa80b8f21410b4612a1e658bb8536`

Raw synthetic logs are retained locally under `lifestream/.lifestream/benchmarks/pwce-action/2026-09-15` in the composition workspace. The enclosing commit binds the producer source and tests. Lifestream consumer code is unchanged at `ea3e159d0a6a69c267203b760b4b4834af767f36`.

## Remaining boundary

Continue the existing LS-S028/PV1-T5 capability and authority mapping. No saved-service restart, deployment, live configuration/effect, personal-data import, training, provider/model selection or new Human acceptance occurred. SYNPRJ_Q7M4 telemetry and the approved four schemas are unchanged.
