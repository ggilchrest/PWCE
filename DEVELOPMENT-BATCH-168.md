# Development Batch 168 — Original-target action reconciliation

## Result

Status: `verified` for this producer component; PV1-T5 remains `in_progress`.

Six regressions failed against producer revision `4d20039187766ecf4261e9ed6173ad96a9961359` before implementation: confirming an action that had never dispatched, malformed target feedback corrupting reconciliation, a late uncertain read overwriting another owner's confirmation, missing immutable dispatch history, contacting a replacement target, and applying a reply to a changed attempt. The same tests pass after correction.

The existing Gateway invocation-status operation now reconciles only after checking the original principal/site/World/environment/Assistant/endpoint/participant/audience scope. It uses the original action and attempt, never invokes again, and rechecks authority after the target read and before persistence/release. Completed actions are read without another target query. Historical records missing an attempt or target binding cannot be rebound through a replacement target.

The ActionService pins the configured target installation identity at admission. Home Assistant uses a digest of configured site/source/base URL; credentials are excluded. A fixture target instance has its own identity because its synthetic state belongs to that instance. Custom targets may provide an identity or receive one through trusted composition. Reconciliation without a matching original identity stays uncertain. The target wait defaults to five seconds, bounded by a supplied read deadline, with a trusted maximum of thirty seconds. It is independent of the expired dispatch deadline. Cancellation, withdrawn authority and changed attempt identity withhold late results. Target exceptions, timeouts and malformed/lossy/oversized feedback remain unknown.

Feedback is copied, bounded to 16 KiB, checked for lifecycle/effect consistency and prevented from supplying host reconciliation timestamps. The original dispatch reply and earlier projection are preserved separately. Later observations retain action/attempt/request/target identity, times, prior-result digest, actual target feedback and their exact-byte digest. Sixteen changing uncertain observations plus a reserved final confirmation are allowed. Repeated identical observations are deduplicated. Confirmed history is checked for corruption on status reads and dispatch retries. A late uncertain read cannot erase confirmation, while an uncertain read does not suppress a later confirmed dispatch reply.

Home Assistant confirmation requires the correct site/source/entity and an update at or after the original attempt start, no later than the current check. Missing, stale, foreign, future or unavailable state cannot confirm success. An off state takes precedence over a retained brightness attribute. Abort signals reach the underlying adapter request. These paths were tested with stubbed data only. The opt-in live smoke script reads the result's observed field from its actual action projection; it was syntax-checked, never executed.

## Compatibility and limits

The published Gateway bundle, seven artifact pins and generated client remain unchanged. Recovery uses the existing status operation and Action projection. Durable history is local producer evidence; full canonical Lifestream artifact/effect-evidence envelopes, snapshot/precondition binding, gateway-scoped Human approval transport and the actual authority/action adapter remain open. This is the existing single-writer StateStore guarantee, not concurrent independent JSON-file writers. A configured target identity is a trusted routing binding, not cryptographic proof of a physical effect. Fresh matching Home Assistant state demonstrates the declared state criterion; no real-device or exclusive-causation claim is made.

## Validation

- `npm test`: 196 tests passed, including 20 new tests.
- `node --test test/action-reconciliation.test.js test/action-gateway-http.test.js test/live-integration.test.js`: 26 passed, including actual authenticated loopback HTTP recovery with one total synthetic invocation.
- `npm run validate`: 13 fixtures and 3 manifest checks passed; unchanged bundle pins are also checked in the source suite.
- Lifestream `node scripts/check-pwce-context-process.mjs`: 19 context and 7 authenticated runtime checks passed against this producer.
- Documentation validation: 28 HTML pages passed links, anchors, image paths, alt text, shared CSS, feature map, manual index and affected-QA release links. No layout changed.
- `node --check scripts/pwce-live-light-smoke.mjs` and `git diff --check`: passed.

Raw synthetic logs are retained under `lifestream/.lifestream/benchmarks/pwce-reconciliation/2026-09-15` in the composition workspace. The enclosing commit binds the source and tests. Lifestream runtime source remains at `11bc7318b1840cff96d86fd898630bc1b820b34a` pending its evidence-only update.

## Evidence digests

- `pwce-reconciliation-baseline.log`: `47702171ee1b55f9429e794ebed4dfb63e4895d4fd38087eca0d1ff7ffe074f6`
- `pwce-reconciliation-full.log`: `5adf052abf30715b89ebf9623574702f0f610a8cb16f1202c82e7eb13e5f133a`
- `pwce-reconciliation-transport.log`: `510de080a32b14612e4a0c074868a9ac8dfc80e2cd550365d482edc7d716fd78`
- `pwce-reconciliation-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-reconciliation-ls-process.log`: `6cb05c77157ce5b83d351f536cdc7d682e806c3bc7f10101178f80c779b82750`
- `pwce-reconciliation-docs.log`: `79b2084f728a974e483f8f66044a7124c1a57a4b1ea27a2813447981a7548e9d`

## Remaining work

Continue LS-S028/PV1-T5 canonical capability/authority mapping, precise grants and host scope, snapshot preconditions and gateway approval transport, followed by joint action scenarios. Remaining S083/S084 work stays authorized. No saved-service restart, deployment, live configuration/effect, personal-data import, training, model/provider selection or Human acceptance occurred. SYNPRJ_Q7M4 telemetry and the four approved schemas are unchanged.
