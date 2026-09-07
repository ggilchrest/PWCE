# Development Batch 71 — Optional multi-site startup

Status: implemented and verified locally.

## Scope

- Discover optional suffixed Home Assistant configurations such as `HOME_TWO`.
- Register each configured site and source with site-qualified identity and independent health.
- Include configured sites in gateway and Basic Agent read scope when explicitly configured.
- Keep the existing reversible Home Assistant action target bound to Home One.

## Evidence

- `test/studio-http.test.js` verifies Home One and Home Two registration and confirms the action adapter remains Home One scoped.
- `npm test`: 68 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/app.js`: passing.
- `node --check src/studio/studio-service.js`: passing.
- `git diff --check`: passing.
