# Development Batch 13 — Studio “Why?” evidence explanation

Status: implemented and verified locally.

## Scope

- Add secured `GET /api/context/explain`.
- Add a Studio “Why this state?” inspector showing knowledge state, source, event time, evidence references, and freshness limitations.
- Keep the inspector read-only and derived from canonical domain query results.

## Evidence

- Browser smoke showed the explanation result as `stale` with its source, observation reference, and freshness limitation.
- `npm test`: 34 tests passing.
- `npm run validate`: contract fixture validation passing.
- Documentation screenshot and walkthrough updated.
