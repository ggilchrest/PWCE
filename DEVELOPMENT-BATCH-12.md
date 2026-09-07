# Development Batch 12 — scoped Studio request context

Status: implemented and verified locally.

## Scope

- Keep the Studio Human-session transport separate from Agent Gateway authority contexts.
- Attach an ephemeral principal and explicit site scope to every Studio session or bearer API request.
- Enforce site scope on current context, action preview, approval, dispatch, action lookup, and evidence lookup.
- Add secured `GET /api/evidence/:evidenceRef` retrieval.
- Return HTTP 403 for authenticated cross-site requests instead of conflating denial with malformed input.

## Evidence

- Authenticated bearer current-context read returned known `home.one::light.kitchen_lights` state.
- Authenticated bearer evidence read returned the source-linked observation envelope.
- Session expiry and site scope tests pass.
- `npm test`: 34 tests passing.
- `npm run validate`: contract fixture validation passing.

## Boundary decision applied

Studio transport authentication remains separate from Agent Gateway authority-context issuance. Both use the same in-process PWCE ownership and authorization seams; Studio does not impersonate an Agent workload.
