# Development Batch 81 — Standalone fixture Agent probe

Status: implemented and verified locally.

## Scope

- Add `scripts/pwce-fixture-agent.mjs` as a runnable external-process compatibility probe.
- Keep the fixture Agent limited to the versioned gateway HTTP contract and read-only context.
- Document gateway-token usage without exposing Home Assistant credentials or effect authority.

## Evidence

- Standalone process smoke against the local PWCE server returned an evidence-linked `stale` current answer.
- `npm test`: 76 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check scripts/pwce-fixture-agent.mjs`: passing.
- `node --check src/agent/fixture-external-agent.js`: passing.
- `git diff --check`: passing.
