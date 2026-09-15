# Development Batch 163 — qualified context and historical evidence

## Result

Prepared Gateway inputs retain each item's knowledge state, contradiction candidates and evidence references, receipt/event times, site, basis, source identity, freshness target and age. The response includes its evaluation time, source revision and invalidation cursor. Current, prepared and explanation paths use the same qualification rule: a conflict remains a conflict when its evidence becomes old. A caller age limit can withhold both the main value and candidate values while retaining disagreement and supporting references. An undeclared freshness target remains explicitly unknown.

As-of retrieval chooses the latest eligible observation from the complete time-bounded snapshot, independently of the accompanying history page or cursor. A disagreement at that time has no arbitrarily selected fact. Age qualification uses the requested historical time. History/as-of/explain source revisions bind to relevant observed material, and search revisions bind to material state; read-only audit writes do not change those revisions. The Basic Agent returns actual observation references in its history answers.

These are producer-owned correctness repairs under the existing open Gateway response envelope. The published bundle, seven artifact digests and generated-client bytes are unchanged; no new optional profile or authority is introduced. Cursor source fingerprints now also bind observation receipt time and freshness metadata; old incompatible continuation cursors must restart from a current first page.

## Validation

- Before changes, all six initial regression cases failed and reproduced distinct defects: missing prepared qualifiers, conflict overwritten by age policy, page-truncated historical selection, an arbitrary historical conflict winner, audit-dependent revisions, and missing Basic Agent history evidence IDs. The failed log is preserved by digest below.
- `npm test`: 147 tests passed, including eight new context cases. The historical page test uses 105 observations and a one-item page. Added tests also cover freshness at the historical boundary and actual HTTP serialization and scoped evidence reads.
- `node --test test/gateway-context-qualification.test.js test/gateway-service.test.js test/adapter-and-query.test.js`: 41 targeted tests passed before the final undeclared-freshness assertion; the final full suite covers that assertion too.
- `npm run validate`: thirteen foundation fixtures and three manifest checks passed; published bundle pin checks also pass in the source suite.
- Actual HTTP tests preserve boolean conflicting values, withhold old values without turning them into false/null, retain world/mode/request/correlation bindings, allow current authorized evidence expansion, and deny foreign-site evidence even when the reference is known. All state and authentication are synthetic; no Home Assistant adapter or action service is used.
- Sixteen current Lifestream contract/client/mapping tests and five explicit authentication-boundary checks pass against the separate-process disposable PWCE fixture. Intentionally mocked negative/parser cases remain fixture evidence; this is not complete Lifestream mapping acceptance.
- Twenty-two documentation pages passed local links, anchors, image paths, alt text, shared stylesheet, feature-map, manual-index and affected-QA release-link checks. The manual and both affected QA journeys have a release note. Studio controls/layouts did not change, so existing screenshots remain applicable.

## Evidence digests

- `src/domain/observation-service.js`: `7e9eaa819940e03680d1fa35012c87c79f3ef93df6c5045691536ab787e9b59e`
- `src/domain/query-service.js`: `631635d987224f27ccd63e68eadf1da2db1d22c4ce48ef8f4bb2cc81949e0968`
- `src/gateway/gateway-service.js`: `38b32c890643b0690c97229e205b8be77531762d654e46c194ca276bbf60a054`
- `src/agent/basic-agent.js`: `106baec1ad28c7e558bb7036df42bc71af03ffdd474494f80164a4aaa8454ceb`
- `test/gateway-context-qualification.test.js`: `bd2b3afc784286ef3eec1a25df65e7daf3700d64ae38d6d0afa3561bf47ed1ba`
- `pwce-context-before.log`: `e54fc436820f1ab2f34eddb3ce1fdeb3c12cc2df49261769eb5f44dc1ad2dc11`
- `pwce-context-focused-final.log`: `cc3663e532966326b266fe62c8759354b2fa5ea41d7db26cc92f7a42b3b84e09`
- `pwce-context-suite-final.log`: `86e98e13cf9396f71b1fc35a15d5745660a6ea83633a94d9edc0d00c8b6048e0`
- `pwce-context-contracts.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-context-docs.log`: `871d866d9b99a06f413262e5b3a32530933bfef857de6e8026072648fe326fda`
- `pwce-context-network.log`: `858181b695805ae54b807a18d0aedc981a335199174d78f0fd6f7a0fd5dfd0cc`
- `pwce-context-network-client.log`: `d5131eaeb066cee969be28f6968dd290ec845368335e04a553a79758d83b65df`

## Remaining work and exclusions

PV1-T5 remains in progress. Lifestream still needs qualified response mapping, ordered invalidation/cache refresh, async authority/capability integration, runtime composition and complete joint scenarios. Scope-bound event subscriptions also need to carry the current Assistant/endpoint/participant/audience and execution-mode bindings through the published transport before shared-space runtime use; this batch does not claim that behavior.

No live configuration, deployment, provider selection, personal-data import, training, physical effect, or Human acceptance occurred. Existing failure receipts and independent repository histories are preserved.
