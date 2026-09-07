# Development Batch 44 — bounded gateway search

Status: implemented and verified locally.

## Scope

- Allow `context.query` search to use its own selector shape without requiring an entity property.
- Enforce bounded search text and result limits.
- Preserve site-scoped authorization and explicit result limitations.

## Evidence

- `test/gateway-service.test.js` verifies selector-free bounded search and rejects an excessive limit.
- `npm test`: 53 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
