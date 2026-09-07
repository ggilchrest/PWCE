# Development Batch 87 — explicit gateway request boundaries

## Outcome

Every GatewayService request now receives or validates a bounded request identity, correlation identity, World scope, and execution environment. The metadata is returned with the operation result and written into gateway audit evidence. A request for another World, an unsupported execution mode, or an expired deadline is rejected before the operation runs.

## Evidence

- `src/gateway/gateway-service.js` normalizes request metadata and carries it into effect evaluation and invocation.
- `test/gateway-service.test.js` verifies metadata propagation and fail-closed world/mode rejection.
- The existing live-effect approval regression remains passing after the boundary change.
- `npm test` — 81 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The default execution environment for ordinary read requests is `normal`. Effect requests retain their explicit `test` or `live` mode, and live mode still requires the existing grant, approval, admission, dispatch, and reconciliation path.
