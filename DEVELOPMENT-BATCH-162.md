# Development Batch 162 — bound gateway request authentication

## Result

Gateway request data cannot supply the HTTP transport token. The route requires an object body, rejects a body token before calling the authenticated service, and binds the token from the bearer header after all request fields. Lifestream's owning client now rejects operation/authority/token overrides at its convenience methods, snapshots input before asynchronous negotiation, and rejects an incomplete or duplicate core operation catalog.

The independently versioned repositories retain their ownership. No PWCE contract artifact or bundle pin changed; the served bundle remains `pwce-agent-gateway.bundle.v1@1.0.0` with digest `32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2`.

## Validation

- PWCE: `npm test` — 139 tests passed, including the new header/body binding and non-object request negatives.
- `npm run validate` — 13 fixtures and three manifest checks passed.
- The new disposable `scripts/gateway-fixture-server.mjs` served actual loopback HTTP with a memory-only store, synthetic token, no Home Assistant adapter and no action service. It expires after 60 seconds and supports explicit stop; it prints only non-secret readiness information.
- Five actual HTTP checks passed: body tokens were rejected with missing, wrong and correct bearer headers (400); a wrong header without a body token was denied (401); a valid header completed health inspection (200). No response exposed the synthetic token.
- Sixteen Lifestream contract/client/mapping cases passed with the client pointed at that real disposable gateway. Some negative/parser cases intentionally use fixture responses; this does not mean every operation was exercised across HTTP. The network path covers authenticated negotiation, scoped authority, health, prepared inputs and the explicit header/body negatives.
- The standalone compatibility CLI was initially invoked without its required lock path and returned usage (exit 2). No new composition-lock acceptance is claimed. Existing compatibility fixture tests remain included in the passing PWCE suite.
- Manual, QA, feature-map and release-note links were updated for the visible authentication behavior. Studio UI was unchanged, so no screenshots were recaptured.

## Evidence hashes

- `src/http/gateway-server.js`: `ca0e3a901a92dcb77693bdcfbb9040adff7998705f965e156526b2151c51ad2f`
- `test/gateway-http.test.js`: `260a1e8179ddc860518371d9d5c02be281e3ae9cc8feda7d6a71750ff061ca49`
- `scripts/gateway-fixture-server.mjs`: `0d86d7fa0c01ee761a2c5afaed5eecd433efafe72f3d1856cfa4c5190415ecf5`
- `pwce-boundary-producer-suite.log`: `be0a1c2618eaef5f2d479f1dd4617c76712d3f96766c236cf543d588e15e0dff`
- `pwce-boundary-producer-contracts.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-boundary-network.log`: `858181b695805ae54b807a18d0aedc981a335199174d78f0fd6f7a0fd5dfd0cc`
- `pwce-boundary-network-client.log`: `041919d401e20b070e2c7202dd3b15180d504a75e44387d376a0f23ff1097039`

## Remaining boundary

This closes request binding prerequisites, not PV1-T5 or the full Lifestream runtime adapter. Rich qualified response mapping, invalidation ordering/resynchronization, async authority/capability integration, server composition and the joint scenarios remain open. No live configuration, Home Assistant effect, provider selection, deployment, or Human acceptance occurred. The prior compatibility and tier receipts remain unchanged.
