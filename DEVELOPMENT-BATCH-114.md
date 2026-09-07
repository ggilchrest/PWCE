# Development Batch 114 — publish the compatibility schema in the gateway bundle

## Outcome

The cross-repository compatibility-lock schema is now part of the published PWCE gateway bundle. Its artifact hash and the resulting ordered bundle digest are pinned in the runtime descriptor and checked-in manifest.

## Evidence

- `contracts/gateway/pwce-lifestream-compatibility-lock.schema.json` is included in the five-artifact bundle.
- `src/gateway/gateway-bundle.js` and `contracts/gateway/bundle-manifest.json` pin the same artifact hash and bundle digest.
- Bundle, HTTP, generated-client, and compatibility-lock tests use the new exact digest.

## Boundary

PWCE publishes the structure and exact PWCE bundle identity. Lifestream still owns the concrete `lifestream-pwce.v1` mapping, fixtures, adapter revision, and completed compatibility results.
