# Development Batch 77 — Site-bound search

Status: implemented and verified locally.

## Scope

- Bind gateway search results to the site selector on the request, not merely to the authority’s broader site set.
- Preserve multi-site authority while preventing cross-site entity leakage from a narrower query.
- Add regression coverage for Home One versus Home Two search isolation.

## Evidence

- `test/gateway-service.test.js` verifies a Home One search contains no Home Two matches under a multi-site authority.
- `npm test`: 74 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/gateway/gateway-service.js`: passing.
- `git diff --check`: passing.
