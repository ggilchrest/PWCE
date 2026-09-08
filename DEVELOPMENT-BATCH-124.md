# Development Batch 124 — publish authority envelope schemas

## Outcome

PWCE now publishes request and response JSON Schemas for authority-context issuance. The schemas describe site scope, TTL, and optional Assistant, endpoint, participant, and audience identities, and are included in the exact gateway bundle digest.

## Evidence

- `contracts/gateway/pwce-agent-gateway-authority-request.schema.json` and `contracts/gateway/pwce-agent-gateway-authority-response.schema.json` are published and hash-pinned.
- Bundle tests recompute both artifact hashes and the aggregate digest.
- `npm test` and `npm run validate` pass.

## Boundary

Adding these published artifacts changes the bundle digest. Downstream consumers must refresh their exact compatibility pins before claiming compatibility.
