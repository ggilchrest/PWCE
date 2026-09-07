# Development Batch 112 — authenticated bundle discovery

## Outcome

The authenticated gateway now exposes `/gateway/v1/bundle`, returning the exact published bundle identity, digest, schema/catalog artifact pins, and generated-client pin. The generated client can discover this descriptor after profile negotiation.

## Evidence

- `src/http/gateway-server.js` serves the authenticated bundle descriptor.
- `src/gateway/generated-client.js` exposes `bundle()`.
- `test/gateway-http.test.js` covers runtime bundle discovery.
- `test/gateway-bundle-route.test.js` covers artifact-pin immutability.
- `npm test` — expected to pass after this slice.
- `npm run validate` — contract validation remains green.
- `git diff --check` — passed.

## Boundary

Bundle discovery does not create the Lifestream mapping or joint compatibility lock; those remain Lifestream-owned.
