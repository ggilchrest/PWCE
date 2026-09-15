# Development Batch 171 — Fresh light target checks

Status: `verified` for the bounded producer component; full PV1-T5 remains `inProgress`.

The Home Assistant brightness path now performs a fresh scoped state read before admitting a new action and again before sending the command. The selected installation, site, source, light identity, state property and valid non-future event time must match. The light must report on or off. An old last-updated time is acceptable for an unchanged light because this is a fresh GET; a cached projection is not used as the precondition.

The host bounds each read to one second by default (configurable 1–5000 ms), also bounded by the request/action deadline. A late, missing, throwing, malformed, lossy or oversized reply denies permission. Fixture targets cannot qualify a live route. Legacy test-only targets without a precondition method retain their synthetic behavior; they establish no physical precondition evidence.

Admission records the checked target, original request fingerprint, host timestamp, observed state and digest. Dispatch records its fresh check before invoking the target. Failed persistence sends no command and retains the claimed attempt for recovery. Current authority, grant, capability snapshot and deadline are checked after the asynchronous read; Human approval is reverified after the read and persistence. Withdrawal or expiry prevents the effect. Checks are bounded to admission and dispatch, and reads reject inconsistent stored evidence.

Idempotent replay checks the stored original before reading current target state. A concurrent admission is checked again inside the writer transaction. Changed arguments still conflict. A changed target cannot turn a retry into another command. An acknowledgment remains uncertain until independent reconciliation; a precondition is not effect confirmation.

## Validation

- `node --test`: 241 tests pass, including 19 new target-precondition cases. The joined HTTP case uses an actual password-authenticated Studio session and scoped Gateway request, then a Home Assistant adapter with simulated fetch responses. Approval sends no request to the target. Unavailability denies admission; a subsequent available target sends one simulated command; retry after unavailability returns the original uncertain result without another read or command.
- Negative coverage includes invalid/future time, wrong entity/site/source, changed installation during read, non-light target, timeouts at both stages, malformed feedback, withdrawn grants, expired approval, tampered evidence and failed persistence.
- `npm run validate`: 13 fixtures and three manifest checks pass. All existing bundle/compatibility tests pass in the full suite; the seven artifact pins and generated client are unchanged.
- `node scripts/check-pwce-context-process.mjs`: 19 context and seven runtime conversation checks pass with the existing Lifestream consumer at `441c67db7805e83e6c621073ca87c77c66694395`. These remain world-context regressions, not canonical action integration proof.
- Documentation: 31 HTML pages pass links, anchors, screenshot paths, alt text, shared CSS, feature map, manual index and affected QA release checks. No Studio layout or controls changed, so no screenshot was recaptured.
- `git diff --check`: passed.

## Preserved diagnostics and limits

The first full run failed 16 HTTP cases because the sandbox prohibited loopback listeners (EPERM); the same suite passed with disposable local listeners permitted. The new joined HTTP fixture initially expected target denial before completing mandatory live-route approval. Both failed attempts are retained; the fixture now signs in and approves the exact pending request through Studio. Runtime approval rules were not weakened. An invocation of the compatibility CLI without its required lock-path argument returned usage; it is not recorded as a compatibility pass.

Fresh reads cannot make Home Assistant state and PWCE admission atomic. Another controller may change a light after the read. This change checks current availability of the existing absolute brightness operation, not compare-and-set semantics, every device feature, physical effects or Human acceptance. The store remains single-writer; digests detect inconsistent stored evidence rather than coordinated malicious database rewriting.

Complete canonical Lifestream capability/authority adapter composition, its control-web action workflow, joint action scenarios and broader policy-review lifecycle remain open. Current precondition component completion does not satisfy those dependencies. No saved service restart, deployment, live configuration, real device effect, personal-data import, training, provider/model selection or new Human acceptance occurred.

The enclosing commit binds this source against producer baseline `50d9a0b9f3919d810e356feadb24509277d0a7ca`. Raw logs and the documentation checker are retained locally under `lifestream/.lifestream/benchmarks/pwce-preconditions/2026-09-15`.

## Evidence digests

- `pwce-preconditions-existing.log`: `b0ed529899dc0935ccb64c8538d524d64d5f5691cb5a02757ff1a8a2d447a803`
- `pwce-preconditions-full.log`: `cbe7d2a1dc7fd62e08fb85b0e309c269ab98a919368c5d148b8da7ef9495c3c4`
- `pwce-preconditions-compatibility.log`: `f727e5fcb21273a52c884169d8e144a442196c1f7c630af49c77dc82aced5db4`
- `pwce-preconditions-http-final.log`: `6096aad6e477887e03e091b249b632545558ecad473f6076364312bf19f1fe47`
- `pwce-preconditions-verified.log`: `7abe049dad86a6d694631e62e485e503edf685883491aeb13110086483d1bbf6`
- `pwce-preconditions-verified-final.log`: `98ed5549c0c7a9ca2de4d483d7c75dcce5a101f7b49d21884953136899a266d4`
- `pwce-preconditions-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-preconditions-docs.log`: `d134b5ec13828fa5f3dd43b0cc27f9a6f6f4871c39233d6387d51912844f644e`
- `pwce-preconditions-ls-process.log`: `67e2c125f112d69cd89e23d9c02d0fdfc64f66ade0d797dc56473da1a0b043e2`
