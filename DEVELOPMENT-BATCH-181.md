# Development Batch 181 — Capability change notifications

Status: `verified` for scoped producer notification delivery. Canonical Lifestream authority/capability subscriptions and their host lifecycle remain in progress.

When a capability read or action check detects changed source content, PWCE now publishes one `capabilities.invalidated` event per principal with an issued authority context. Each event has a principal watch selector, so every authorized site connection for that principal receives it. Multiple contexts share the same event instead of producing duplicates. Other principals receive only their own scoped event. The former unscoped event had a null watch and was silently filtered out of both live delivery and replay.

The existing connection authentication and authority checks still run before delivery. Expired or revoked connections close without receiving further data. Persisted replay retains the actual event ID, cursor and source digest; bounded retention still requires resynchronization when history is missing. Restoring old source content produces a new invalidation and cannot revive a previously invalidated snapshot. The source change is detected by existing snapshot reads/checks; this change adds no background configuration watcher.

## Verification

- `npm test`: 307/307 pass, including eight new tests.
- `node --test test/gateway-capability-events.test.js test/gateway-stream-scope.test.js test/capability-snapshots.test.js`: 29/29 pass. Coverage includes multiple sites and principals, shared contexts, unchanged reads, replay, restart, expiry, credential/grant revocation, retention gaps and restored source content. A real authenticated local HTTP SSE connection receives the same scoped event returned by replay. These new tests cause no target calls.
- `npm run validate`: 13 foundation fixtures and 3 manifest checks pass.
- Lifestream `node scripts/check-pwce-dispatch-process.mjs` and `node scripts/check-pwce-context-process.mjs`: 65 existing separate-process checks pass, with exactly four existing synthetic target calls. These remain compatibility checks, not proof that canonical consumer stream composition is complete.
- Documentation: 39 HTML pages checked for internal links, anchors, shared CSS, screenshot references, feature map, indexes and the affected QA release link. No Studio UI changed and no screenshots needed replacement.
- `git diff --check`: pass. Public contract bytes and bundle identities are unchanged.

The initial seven-test reproducer failed before the routing fix. After the fix, one assertion still expected a context-revision error after replacing the bearer credential; the correct result is `authentication_failed`. That assertion was corrected, and a real HTTP SSE case was added. All initial and final logs are retained; no failed evidence was rewritten.

Producer baseline `cffeb4c57040cf2dec0433ef9a8cbaf9cc0c782e`; the enclosing commit contains the implementation. Joined Lifestream revision `f364079046fda504c78b42f976b96577296254cb`. Raw logs are retained outside Git at `/Users/gg/Development/Agentic/Tifa/lifestream/.lifestream/benchmarks/pwce-capability-events/2026-09-15`.

No saved service, compatibility lock, live configuration, physical device, model selection, personal data, training or Human acceptance changed. The PWCE private repository remains untouched. Next: map these authenticated scoped events into Lifestream's canonical authority/capability streams and enforce bounded multi-site resume, cancellation and cache invalidation at the host boundary.

## Source SHA-256

- `src/gateway/gateway-service.js`: `e96d5099460e631067a28c9231ed27c95b4ee741923ad8546841631bb27458e9`
- `test/gateway-capability-events.test.js`: `75f9521050a83026eb545aab8f5e82ce676c8ceda391a7d1cab7708ef1efc594`
- `docs/user-docs/feature-map.md`: `6160362432eb2e86560583844587075a99d2e30138ae5459ad13572282942bd3`
- `docs/user-docs/manual/inspect-local-context.html`: `c8f4ad547719af3c5cf0ccb850d022f3612f49e0049e6c2749c3f5c884bc146f`
- `docs/user-docs/qa/inspect-local-context.html`: `30260c85359edf90d4f70b107ef5a4b89b10fff5c2e82fa07fb8c6195156b625`
- `docs/user-docs/releases/2026-09-15-capability-change-notifications.html`: `079fe7c86ff88e2b56a55e7112aaaad9b3fdd9837b93ea6d67e10aa53042f2e8`
- `docs/user-docs/releases/index.html`: `eee85b437bdb99c116c50a2ad9348b1384e6eb6d425b98e375d4329e09aaaf27`

## Validation logs

- `pwce-capability-events-before.log`: `488eb943cbb9bd6ef2663943108667c4d49462b19e12bf056dc1b8df1a6d1026`
- `pwce-capability-events-contracts.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-capability-events-docs.log`: `c1bbde37617059e5c0fed72e4fcc8656902a6bd6ab49b218e22178a489b66adf`
- `pwce-capability-events-focused-final.log`: `0d17d621db780a29802fe9951037a04702486c511e4fc90a4e5a94fed95d8b4b`
- `pwce-capability-events-focused.log`: `ec3ca5c302dd5cdf1d2dcac09f6be7a4ec13120420dfbb4e03575193491d05f8`
- `pwce-capability-events-full.log`: `21dc2006401b2159877dd655a74e4ede3f63f521358f33f8dea19b3ebbc6fb5d`
- `pwce-capability-events-lifestream-context.log`: `fcb743749fa322047161cb59523afdfaf5f72816abe0377a2fd1dec8d072124b`
- `pwce-capability-events-lifestream-dispatch.log`: `19c7ccd834cf280025793d1c830040c60e754da813d939ea52fa5c718dd47d6a`
