# Development Batch 20 — explicit gateway authority evaluation

Status: implemented and verified locally.

## Scope

- Add the required `authority.evaluate` gateway operation.
- Return a non-admitting, explicit denial while gateway effect capabilities remain unactivated.
- Preserve capability and site selectors plus a stable rationale and limitation.

## Evidence

- `test/gateway-service.test.js` verifies evaluation cannot admit the requested light action and reports `effect_capabilities_not_activated`.
- `npm test`: 39 tests passing.
- `npm run validate`: contract fixture validation passing.

Dispatch authorization and effect invocation remain deferred until the gateway effect profile is activated; Studio’s separately governed local action path remains the current T4 implementation.
