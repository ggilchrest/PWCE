# Public capability definitions

PWCE owns the capability descriptor, argument schema and result semantics. `contracts/capabilities` publishes `pwce-capability-contracts.bundle.v1@1.0.0` independently of the unchanged core Gateway and trusted-dispatch bundles. The ordered-path/byte digest pins the catalog, descriptor and both schemas. `node scripts/generate-capability-contracts.mjs [--write]` verifies or generates the manifest and runtime constants from those public files.

The current descriptor is `home.light.set_level@1.0.0`. Its input is `{siteRef, targetEntityId, parameters: {level}}`; level is absolute brightness from 0 to 1. Site membership, active grants, Human approval, target availability and final admission are separate runtime checks. The result schema describes the original normalized action result, including host completion/reconciliation timestamps when present. `succeeded` and `partially_succeeded` require a reported effect; `outcome_unknown` requires unknown effect status; denial/rejection require no effect. Only the complete canonical outcome mapping can decide how to expose these distinctions in Lifestream.

Snapshots now include the descriptor title/description, stable input/result schema IDs and exact artifact metadata (reference, SHA-256, UTF-8 byte length, media type and schema dialect). Schema text is not duplicated inline in each capability snapshot. The generated definitions and nested artifact references are immutable. Their source content participates in the existing snapshot source digest, so a changed catalog invalidates an older retained snapshot.

Authenticated read-only routes:

- `GET /gateway/v1/capability-contracts` returns the public bundle manifest and descriptor metadata.
- `GET /gateway/v1/capability-contracts/<sha256>` returns `{artifact, schemaJson}` for one of the exact published schemas. Re-encode `schemaJson` as UTF-8 and check its digest and length before resolving the schema. The lookup cannot read arbitrary paths or stored evidence.

These public static definitions require the configured Agent bearer credential in this HTTP binding; they do not require the host dispatcher secret. They are not scoped observations, grants, an admission receipt or a physical-effect confirmation. Reading them creates no approval or action. Unknown hashes return 404; a caller must not substitute a similarly named schema.

Schema tests use the pinned AJV and format-validator development dependencies (`npm ci`). Runtime remains dependency-free apart from Node: no schema compiler was added to the action hot path. The tests compare actual producer input/result behavior and authenticated artifact responses with the published schema. The existing normal Gateway, dispatch transport and legacy fixture paths retain their behavior.
