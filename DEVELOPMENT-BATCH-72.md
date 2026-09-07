# Development Batch 72 — Cross-site effect isolation

Status: implemented and verified locally.

## Scope

- Restrict the gateway development Action grant to the Home One adapter that actually owns the live target.
- Add target-side site validation as a second defense before Home Assistant service calls or reconciliation.
- Preserve multi-site read registration without allowing an accidental Home Two write through Home One.

## Evidence

- `test/live-integration.test.js` verifies a Home Two request is rejected before the adapter is called.
- `npm test`: 69 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/studio/studio-service.js`: passing.
- `node --check src/http/dev-server.js`: passing.
- `git diff --check`: passing.
