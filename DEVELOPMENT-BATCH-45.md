# Development Batch 45 — source provenance versions

Status: implemented and verified locally.

## Scope

- Register provider, source-registration, configuration, and normalization profile identities.
- Copy those versions into every accepted observation's provenance.
- Preserve historical interpretation metadata across later source changes.

## Evidence

- `test/adapter-and-query.test.js` verifies accepted fixture observations retain registration, configuration, and normalization metadata.
- `npm test`: 53 tests passing.
- `npm run validate`: contract fixture validation passing.
- `git diff --check`: passing.
