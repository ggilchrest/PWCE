# Development Batch 183 — Current scoped permission reads

Status: `verified` for the producer permission-read boundary. Lifestream external permission representation remains in progress.

The Gateway now checks original authority, permission generation, World, expiry and request deadline after its awaited permission read, before releasing the response. A scope that changed during storage access cannot receive a result labeled current. The opaque source revision binds the scoped permission summary and permission generation. Unrelated sensor observations do not advance it; removing and later restoring identical permission terms cannot reuse the older generation's revision. The summary remains a producer-owned projection, not a local Human grant, approval or dispatch permission.

Producer baseline: `e7c408c5d4ddb1cb1d9fe9579c7e08d91f056d3f`; the enclosing commit contains this implementation. Joined Lifestream revision: `1709da9c3f629fcf81f69585305ab9f95547768f`. Existing published bundle bytes, schemas and generated client are unchanged.

## Verification

- `node --test test/gateway-grant-read.test.js`: six checks pass. They first failed against the baseline: the permission revision changed with unrelated observations, and five awaited reads returned after grant revocation, principal rotation, authority expiry, request deadline or World replacement. The original failing log is preserved. The corrected suite verifies no action or approval creation.
- `npm test`: 324/324 pass, no skips.
- `npm run validate`: 13 foundation fixtures and three manifest checks pass.
- `npm run generate:gateway-bundle`: byte-identical core bundle `32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2`; generated client unchanged.
- Lifestream `PWCE_HOST_DISPATCH=1 node scripts/check-pwce-host-process.mjs`: 22 isolated actual-host/producer checks pass, four synthetic target calls, eight dispatch POSTs. This covers existing dispatch compatibility; it does not establish a new grant-query consumer.
- Documentation: 41 HTML pages checked for local links, anchors, shared CSS and assets. Feature map, manual, QA and release index updated. No Studio UI or screenshots changed.
- `git diff --check`: pass.

Raw logs and SHA-256 manifest: `/Users/gg/Development/Agentic/Tifa/lifestream/.lifestream/benchmarks/pwce-grant-read/2026-09-16T152258Z`. No saved service, live configuration, physical device, model selection, import, training or Human acceptance changed. Private specifications remain untouched. Next: represent the published scoped permission summary faithfully through Lifestream's external authority boundary, preserving the difference from individual local Human grants.
