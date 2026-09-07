# Development Batch 78 — Freshness-aware current context

Status: implemented and verified locally.

## Scope

- Apply each projection’s declared freshness window to current queries, not only explanations.
- Preserve `stale` knowledge state in single-site and multi-site gateway results.
- Make Basic Agent responses distinguish stale evidence from missing evidence.

## Evidence

- `test/runtime-state.test.js` verifies current state becomes stale after its freshness window.
- `npm test`: 75 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check src/domain/observation-service.js`: passing.
- `node --check src/gateway/gateway-service.js`: passing.
- `git diff --check`: passing.
