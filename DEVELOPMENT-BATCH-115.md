# Development Batch 115 — publish the bundle digest in the manifest

## Outcome

The checked-in gateway bundle manifest now publishes the exact bundle digest alongside its identity and version. Tests compare the manifest’s artifact pins and digest with the runtime descriptor, preventing the two published descriptions from drifting apart.

## Evidence

- `contracts/gateway/bundle-manifest.json` includes `bundleDigest`.
- `test/gateway-bundle.test.js` verifies bundle identity, version, digest, and artifact pins match `gatewayBundle`.
- `npm test` and `npm run validate` pass.

## Boundary

This closes the PWCE publication-integrity gap. Lifestream still must supply its own published profile, mapping, fixtures, adapter revision, and compatibility results; this batch does not invent those values.
