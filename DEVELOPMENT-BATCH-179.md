# Development Batch 179 — Read-only recovery of original admission

Status: `verified` for the producer admission-recovery component. Lifestream consumer adoption and the full canonical adapter remain in progress.

A discarded admission reply no longer requires knowing the returned action reference to find original producer custody. A separately pinned Agent-authenticated query accepts the original idempotency key, exact fingerprint, snapshot and approval terms. It checks current original authority and complete foreign scope, then returns only the existing admission proof and action reference. Unknown is not proof of absence and never grants permission to resend. The original deadline comes from retained evidence and is never renewed.

No action, approval, snapshot, precondition, target invocation or reconciliation is created by lookup. Normal Gateway request audit remains required. Expired original admission can be read under current original authority; expired/revoked context, scope substitution, late reads, corrupt proof, duplicate keys and audit failure withhold evidence. The ordinary Gateway request route rejects this separately negotiated extension. Its raw input is limited to 65,536 bytes; other routes retain their existing transport ceilings.

## Verification

- `npm test`: 299/299 pass, including 14 new recovery tests.
- `node --test test/admission-recovery.test.js`: 14/14 pass. Actual synthetic HTTP discards the whole admission reply and reconstructs lookup only from prior request information. Reads leave target counts unchanged. Opening a new action-store owner preserves original evidence; full Gateway context restoration is not claimed.
- `npm run validate`: 13 foundation fixtures and 3 manifest checks, no failures.
- Recovery, admission and invocation contract generators: exact bytes and dependency pins pass. Existing core, dispatch, capability, admission and invocation bundle files are unchanged.
- Existing Lifestream separate-process checks: 31 dispatch/catalog/authority/admission/invocation checks plus 26 context/runtime checks pass; four synthetic target calls remain exactly four.
- Documentation: 37 HTML pages checked for links, anchors, shared CSS, screenshot references, indexes and the affected QA release link. No Studio UI changed; no screenshots require replacement.
- `git diff --check`: pass.

The first focused run passed 11/12: its participant-order test mutated the shared fixture scope, causing the following test to receive a correct scope denial. The query now clones that scope. Both logs remain archived. A standalone compatibility CLI attempt omitted its required lock path and exited with usage; it is not claimed as compatibility certification. Existing compatibility unit tests and actual joined-process checks passed. No saved compatibility lock is changed or promoted.

This component implements producer-owned recovery in support of existing restart/idempotency requirements. It does not complete Lifestream admission recovery, configured runtime activation, authority-context restoration, invalidation streams, external grant-query representation, physical effects, model selection or Human acceptance. No saved service, live configuration or personal data was used.

Baseline `aa108b1fe9e02adf8fd832c47faeec9b88aa811d`; the enclosing commit contains the implementation. Joined Lifestream revision `f05636a82b0d9bb7b687d05e87ef7b400ffe2a87`. Recovery bundle `pwce-admission-recovery.bundle.v1@1.0.0`, digest `43d1d8e574bf09a92bf1cd24ac69ffbb6a2e6a56c7628ae8dfe35d18854a5ab3`. Next adopt this exact published profile in Lifestream's retained admission path.

## Source SHA-256

- `contracts/admission-recovery/bundle-manifest.json`: `58779260465c57fdb3f84853d9d918606e159b967d654fc1fde7624b7f5ecb15`
- `contracts/admission-recovery/profile.json`: `d0efa349ec7cc2c876cdee67fcad837811a2d3e95132676a3724290ad663f9c6`
- `contracts/admission-recovery/request.schema.json`: `9cd50d512bb461f6238d5790c716c2ed5c10aeb3e6ca40798bf4d26b659678b2`
- `contracts/admission-recovery/response.schema.json`: `fb513d5fc385652427f8477cb312c0cb354ddb240b05fafd0d5efdc69f8e0c26`
- `docs/trusted-dispatch-boundary.md`: `e3bc10491f74d154d2b8e3ea5f2dc23bf9ed847811d8145c2853386f758378de`
- `docs/user-docs/feature-map.md`: `15975b0977ce347753d391aaa7d4ab5283cac0a81ee3bece1c0c2db1a7afbfa3`
- `docs/user-docs/manual/inspect-local-context.html`: `91dedc4fc73ec063c8cefcfff101b59b6813eaa1a0703d18c025cb62a47f203a`
- `docs/user-docs/qa/inspect-local-context.html`: `edc5931f0fae0d0d6d8f16c2443db9c31368a03c1c8104c9b0d6a223fc38819d`
- `docs/user-docs/releases/2026-09-15-missing-permission-reply.html`: `c935c27dc21ee695eb0879c1dbe4b5da8ab23d22850a8fda911fb1adb78acb36`
- `docs/user-docs/releases/index.html`: `833f4924feb14786b9522cf306adfd7b415e81e8f38cb15d90910c3b1997e952`
- `scripts/generate-admission-recovery-contracts.mjs`: `339c5c68c4ef66b0c75418e2ee1bacf551412c37edb493e17bf5e1fe117608b5`
- `src/actions/action-service.js`: `a09395eba29070114ba88ec8e558f56d4a440fdeda0e52e982270f34a06958e1`
- `src/gateway/admission-recovery-contracts.js`: `2d9417c4489613170152d84050874927cffca0875239803aa1685cd443695803`
- `src/gateway/admission-recovery-validation.js`: `7ec1af1d7a2e86d34df04c2ba349ca0de669320c1d48e73d1bc4d5dd09b8f8d6`
- `src/gateway/gateway-service.js`: `6c9c25c030e70f16a28bd20175d75605efba522ec5bfbb2d641630596c4d2908`
- `src/http/gateway-server.js`: `e22d0fd92b9a780427908fd99fddfe490dc5fe59f768d4b57d1ca41a7f02111c`
- `src/http/json-body.js`: `eb0cf91d3a17879c1a7bebc5bb4bb77744122dff82ee68fd72f9826f74e9639e`
- `test/admission-recovery.test.js`: `e0108d82843965210c082712fff996333e557fd197789a88b48e7d0889b3e99a`

## Logs

Archive: `lifestream/.lifestream/benchmarks/pwce-admission-recovery/2026-09-15`.

- `pwce-admission-recovery-admission-pin.log`: `b09be31b79562f56f846444a1270edf3de8e761babda86139ae129b713c4c28f`
- `pwce-admission-recovery-compatibility.log`: `f727e5fcb21273a52c884169d8e144a442196c1f7c630af49c77dc82aced5db4`
- `pwce-admission-recovery-docs.log`: `e8b81287293513c436f921a7a81f0dab60141e0dbc7e1f4fd596b988cd7021c9`
- `pwce-admission-recovery-fixtures.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-admission-recovery-full-final.log`: `305d086603c0207edabc2209d2603514163efc3203749becc5166e34f9c889e9`
- `pwce-admission-recovery-full.log`: `e5662b74c7103fff30d04a692d0708e957a7301079480f7bc0bdf7787e5e09c4`
- `pwce-admission-recovery-generation.log`: `e62c058431858bdcdf26fde82456a23a5f4807d862e2946598afd1e831e76c40`
- `pwce-admission-recovery-invocation-pin.log`: `4221ed77c5032b28416f4c54e4fe61f84be30f2cc57655a4fcaabe40af271b80`
- `pwce-admission-recovery-ls-context.log`: `9ced33ba103f65028e5b4390e317a264d3cf69783e60223fb2c0c3c0fa38f670`
- `pwce-admission-recovery-ls-dispatch.log`: `a683c3343b76b5987f3b19b488f364c1dbebcbe1d0e27548c553884f868dae31`
- `pwce-admission-recovery-pin.log`: `e62c058431858bdcdf26fde82456a23a5f4807d862e2946598afd1e831e76c40`
- `pwce-admission-recovery-unit-final.log`: `659e666a15fb2b49190261ea5d9115cba83d6bc95b812687b4107de57bf9fe5e`
- `pwce-admission-recovery-unit-initial.log`: `aaeb0016083b43b5fdad286659ae5b1758ad2f1b395a3813720167fd55466b12`
- `pwce-admission-recovery-unit.log`: `81acae7176420ffc662a59a03c6ffd93178e50c94a77f922beb98a9398237d69`
