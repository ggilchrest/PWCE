# Development Batch 165 — scope-bound event connections

## Result

The HTTP event route now forwards Assistant, endpoint, participant, audience, World and execution-mode fields to the existing authenticated request boundary. It rejects unknown, duplicate and oversized query fields. The token remains exclusively in the bearer header. Participant lists use one JSON-encoded query parameter.

The producer installs its replay snapshot and live listener synchronously after revalidating the authenticated context. It checks authority before every live event, on principal/grant/World changes, and expires quiet connections after the shorter of remaining authority lifetime or 30 seconds. Revocation emits only a terminal resynchronization reason; no further protected invalidation is delivered. Disconnect and backpressure release the listener. Events are cloned before callbacks so a consumer cannot modify retained replay.

Expired/future cursors and replay exceeding the requested page bound require a fresh read. Filtered streams may have numeric cursor jumps because the cursor sequence spans sites. The JSON replay operation retains bounded pagination; streaming does not silently drop the remaining pages. Existing published request schemas, profile, catalog, bundle and generated-client artifact remain unchanged. The producer-generated convenience client still exposes its legacy unscoped subscription; scoped transport is exposed by the Lifestream-owned client.

## Validation

- `npm test`: 156 tests passed, including eight new stream service cases and one new HTTP binding scope case.
- `npm run validate`: 13 foundation fixtures and three manifest checks passed, with unchanged published bundle pins.
- Lifestream `node scripts/check-pwce-context-process.mjs`: 15 separate-process HTTP checks passed. Thirteen read checks remain; the added checks reject five foreign subscription identities and prove exact-scope acceptance plus automatic quiet authority expiry over an actual HTTP stream.
- Twenty-four documentation pages passed link/anchor/image/alt-text/shared-style checks. The new release note links the affected QA page, is listed in the release index and points to the updated manual. No Studio layout changed.
- Initial regression runs encountered sandbox loopback restrictions; permitted synthetic-port reruns passed. An outdated oversized-frame test stub was updated for the authenticated stream entry point while retaining its original limit assertion.

## Evidence digests

- `pwce-stream-producer-final.log`: `0b7f4e6dca7cc06b882809682a5f44a489a2929d6f6b3b8b7d7cb2b09e6ae1e6`
- `pwce-stream-contracts.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-stream-process.log`: `ab485f6c4c92c2383cf1d5c3f0f7fe58e159a5d03adf381803c468f151c00a8c`
- `pwce-stream-docs-final.log`: `1747bbe3c3a7e01aa39728b8b54b1640281f7a49ded7241886ea9f6f33a81ec6`

## Remaining boundary

This verifies the scoped stream component, not full PV1-T5 or LS-S028 acceptance. Lifestream still needs ordered invalidation/cache resynchronization, async WorldContext/Authority/Capability runtime composition, full mapping-profile fixture/digest qualification and joint scenarios. No deployment, saved-service restart, live effect, provider/model selection, training, personal-data import or new Human acceptance occurred.
