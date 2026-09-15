# Development Batch 175 — Producer-owned capability definitions

Status: `verified` for public capability definitions and authenticated artifact discovery; full canonical Lifestream action mapping remains `inProgress`.

PWCE now publishes the existing light operation's title, description, input schema, result schema and exact schema artifact references. The generated capability catalog uses those producer-owned definitions directly. It does not require Lifestream to invent a competing argument or result contract. Input fields are the site, target and bounded absolute brightness. Result definitions preserve success, failure, partial results and uncertainty; success/partial success require a reported effect, unknown outcome requires unknown effect status, and denial/rejection require no effect.

`pwce-capability-contracts.bundle.v1@1.0.0` pins the public catalog, descriptor and schemas by ordered path/byte SHA-256. The generated manifest/runtime constants retain exact UTF-8 schema bytes and references. Schema artifacts identify their JSON Schema dialect separately from their document identity. Nested metadata is immutable and participates in existing capability snapshot invalidation.

Authenticated read-only routes serve the static public bundle and exact schemas by digest. Unknown digests cannot read filesystem paths or evidence, and reads create no grant, approval or action. The existing core Gateway and trusted-dispatch bundle bytes and identities remain unchanged. The new contract has its own bundle identity and must be explicitly pinned by consumers.

## Verification

- `npm test`: 269 pass, zero failures/skips, including four new capability-contract tests and all existing action, approval, snapshot, reconciliation and HTTP tests.
- `npm ci` plus `node --test test/capability-contracts.test.js`: fresh lock-based development dependencies and all four checks pass. AJV and its format validator are exact-pinned development dependencies only; the runtime hot path remains Node-only. Installed packages are ignored rather than committed.
- Actual accepted/rejected light arguments agree with the published input schema. Actual fixture success, timeout and unknown results validate against the result schema; false success/uncertainty combinations fail.
- Authenticated real HTTP returns exactly the pinned schema text and byte lengths. Missing credentials, wrong methods and unknown schema hashes fail without creating actions or approvals.
- Capability generator verifies byte identity and independent tests recompute source hashes. The core Gateway and trusted-dispatch generators verify unchanged published bundles. Foundation validation passes 13 fixtures and three manifest checks.
- Documentation checker verifies 33 HTML pages, links, anchors, screenshot paths/alt text, shared styles, feature-map/index and affected release/QA links. Studio controls and layouts did not change; no screenshot was recaptured.
- Lifestream consumer `319a458fbf53fcb77f70e038c64a6c6267ad6de1` passes seven separate-process dispatch checks, nineteen world-context checks and seven runtime-conversation checks against this producer source. These preserve regression claims; they do not verify the new canonical capability mapping.
- `git diff --check`: pass.

## Remaining mapping requirements

The canonical adapter must explicitly map PWCE's opaque capability identity (`home.light.set_level`) into Lifestream's capability-ID grammar while preserving the original producer reference and version. It must retain original snapshot/authority custody, schema bytes, producer admissions and effect outcomes, and must not substitute local Human grants for configured PWCE authority. The current canonical grant-query data family assumes Human grants; external grant observations must not be fabricated into Human grants or silently reported as empty. These are remaining implementation/contract-integration items, not completed by this descriptor increment.

No saved-service restart, deployment, live configuration, real target command, personal-data import, training, provider/model choice, performance certification or Human acceptance occurred. SYNPRJ_Q7M4 telemetry was not rerun or modified. Preserved dirty artifacts remain unchanged.

Producer baseline: `487e465101df02bfa1b4e569ce6781b8edda4a78`; the enclosing commit binds the following source. Raw logs remain local under `lifestream/.lifestream/benchmarks/pwce-capability-contracts/2026-09-15` in the composition workspace.

## Source SHA-256

- `.gitignore`: `9c949e8cacb7c93966387555dca4a77d6ea17d2909489c6538c9cfa44f6e8e22`
- `contracts/capabilities/bundle-manifest.json`: `0b5d09f22618293f7767601d9fbdf715ad0b2b35e637272ee2357457657f2b0c`
- `contracts/capabilities/catalog.json`: `d23f06b1b40814c1f7e5c2fb1ad556bb0f4089c1b1466b7e53af8bd2361d3bed`
- `contracts/capabilities/light-set-level/descriptor.json`: `6e805ece30e0cd3d12b90d5afd7cc82a91e013917f3d75f950cd80e93865d051`
- `contracts/capabilities/light-set-level/input.schema.json`: `cafb6e1ced3bbaa386ec6a59980eda545ab44f410ed9e1de809509be48bc7b6f`
- `contracts/capabilities/light-set-level/result.schema.json`: `98ffa74264afed417b87d4cd385129508e2b90768d579002b6237298cc9460fc`
- `docs/capability-contracts.md`: `359cfb526f916628843f70e4838138c1d541bf647c335b19bb4a49d390793413`
- `docs/user-docs/feature-map.md`: `6edf71c8df19fe235c973c6c17d293e953180a13813b9fcf7a94838d098369fc`
- `docs/user-docs/manual/inspect-local-context.html`: `0832a5ba08a35aabc9fc268a0a3732a0caa7b7ba2a6ca7d5100106faaf1e182b`
- `docs/user-docs/qa/inspect-local-context.html`: `a89ddea9828834b634926e76d7d344179eb7b01d2b55ef6454f4a4f34aac6c56`
- `docs/user-docs/releases/2026-09-15-capability-definitions.html`: `b2704df2926bb365770fb4d68ad656213af0afc9e9e9f34feca58a4f8a809818`
- `docs/user-docs/releases/index.html`: `0194640845a0b3f78b12d099b62b9394b57d9afcdec5e1e72b0b72a177d3e4c0`
- `package-lock.json`: `c8fcacc851a472422f0fbb618771e26d8ac4c46a31fe7848181319b97b22fcc1`
- `package.json`: `82822358eb04928d69c98a1e076fcf68a3fdbc20e5ba36c104fca51b5d9088e3`
- `scripts/generate-capability-contracts.mjs`: `da5bca809bbbc8796902661b351fe714246712e175b0fbb509fcef9c1860e3d0`
- `src/actions/capability-catalog.js`: `691928992c4ff413c394aea2ce179a1566cd605372296c53c3b27f6f53083123`
- `src/actions/capability-contracts.js`: `53c1a20e5c19e84e80f4a617ee1a892556a3bb1a15fdf405602b40ebd4d5c1c6`
- `src/http/gateway-server.js`: `7d80d0347d97f211961f676516fdd67782791801c10def980fda5a9957ae49bd`
- `test/capability-contracts.test.js`: `a4010bac30ec478641a63f36fe6c8598b92e6d5bc45987464bf57485b0113ed3`

## Log SHA-256

- `pwce-capability-contracts-full.log`: `31cccecc81bb8b34ebb395f078f813c3dae57fb4a1f7568043b289585df11d07`
- `pwce-capability-contracts-tests.log`: `92bf8ab0f22a60567354be9bf8d895c33aa35234a509b9d49dde39339ba399ee`
- `pwce-capability-contracts-install.log`: `cf13cfe2e713aeab7c35c7e45a8bcb5f265831bbaa02ce576528d7d769df5439`
- `pwce-capability-contracts-bundle.log`: `8692af66d32dd80c0d90dcd4d2ef70ec234ab885b59ba606b11b0b6c313222ee`
- `pwce-capability-contracts-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-capability-contracts-core.log`: `45fe2ceba9163ec01a876ec5d733d3fdcff413171e999a0645f26ef1288c048d`
- `pwce-capability-contracts-dispatch.log`: `8426261699523d5e9ed950b159ba99bfb934e26ce15dca4c2545f5b4cf9ba161`
- `pwce-capability-contracts-docs.log`: `2348b4d60abfd312537c13c571191332e4af614069e26eb05eb8ff1a4383dd42`
- `pwce-capability-contracts-ls-dispatch.log`: `9b6c7d7865c980ec491158c978a4d923f27134e2c09b1fa5745be37a4ef7f2c2`
- `pwce-capability-contracts-ls-context.log`: `8e75cbe816a0d260b122cde5a81ef754a6d1f75cc25c83bbf59056a95f4cc8f7`
