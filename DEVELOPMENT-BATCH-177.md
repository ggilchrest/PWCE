# Development Batch 177 — Original invocation and result evidence

Status: `verified` for the producer proof and status-recovery component. Full canonical Lifestream invocation/status mapping remains in progress.

The new public `pwce-action-invocation.v1@1.0.0` profile binds current producer status and result to unchanged original admission evidence, the sole recorded dispatch attempt, its original timestamps, the first stored dispatch reply and the latest reconciliation reference. Actual trusted invocation and qualified status responses carry this proof. Read-only reconciliation preserves the first reply and can confirm the same original action without another invocation. All eight producer terminal outcomes remain distinct; partial success is never full success. A failed reply with unknown physical effect now remains eligible for read-only status reconciliation.

The schema embeds exact copies of the separately published admission and result schemas. The generator verifies both against their source artifacts and checks admission, capability and dispatch dependency pins. Existing core, dispatch, capability and admission bundles are unchanged. Static Agent-authenticated manifest/schema routes create no authority, approval or action and require no dispatcher credential. Proof generation validates original admission, attempt consistency, status/result, host timestamps, bounded feedback and reconciliation custody. Neither a new admission nor target identity is reconstructed from a reply.

Legacy targets without stable target identities retain their existing scoped action/status view with `invocationEvidenceUnavailable: original_target_identity_missing`. Qualified proof is absent. Missing and foreign actions also disclose no proof. Other malformed custody fails explicitly. Proof generation failure after an admitted effect does not imply rollback or justify resending.

## Verification

- `npm test`: 285 pass, zero failures/skips; ten new proof tests plus existing recovery, action, approval, context and HTTP coverage.
- `node --test test/invocation-evidence.test.js`: ten pass. Actual HTTP covers published artifact bytes, admitted/started/succeeded states, all eight terminal outcomes, preserved unknown dispatch reply followed by confirmation, failed-with-unknown-effect recovery, foreign/missing withholding, and corrupt result/attempt/time/history rejection. Schema validation uses the actual generated public schema and embedded dependencies.
- The first full run passed 282/284 and exposed two existing unqualified target integrations. The compatibility path now preserves their status without manufacturing a stable identity or a qualified proof. That failed log is retained. All later final-source checks pass.
- `npm run validate`: foundation fixtures and manifest checks pass.
- All five contract generators: exact byte identity, dependency/artifact digests and unchanged older bundles verified.
- Documentation: 35 HTML pages; links, anchors, shared CSS, screenshot references and alt text, feature map, manual/release indexes and affected QA links pass. Studio layout/controls are unchanged.
- Lifestream consumer `d07d6efc637ecbc2febaccd7f0056fc7e70fb90f`: 50 joined regression checks pass (6 admission, 5 preview, 6 catalog, 7 dispatch, 19 context, 7 runtime). This proves existing integration remains compatible; it does not claim the new invocation-proof consumer is implemented.
- `git diff --check`: pass.

No saved service, live configuration, deployment, real target, personal import, training, model selection or Human acceptance changed. SYNPRJ_Q7M4 telemetry was not rerun or modified. Unrelated dirty artifacts remain preserved.

Producer baseline: `b0b8c93191570903088f6f248e817482678017fe`; the enclosing commit contains the source below. Next continue Lifestream original invocation/result/status custody and mapping against this published proof. External grant representation, invalidations, configured runtime composition, restore fences and physical/Human qualification remain separate required work.

Bundle digest: `080100b1c4f57b46538d93a87a0f66fafc3c7b91a0e6baa5b42a7f539d4029c9`. Raw logs: `lifestream/.lifestream/benchmarks/pwce-invocation-evidence/2026-09-15` in the composition workspace.

## Source SHA-256

- `contracts/action-invocation/bundle-manifest.json`: `0cea7375ea358e7220cace246f8edbf0b04516030c78d723a3172b7ce0c66747`
- `contracts/action-invocation/evidence.schema.json`: `ce80aa98cb6ee30559b07b58aa141ccb2c15d65e0377d9451a867323a9620c35`
- `contracts/action-invocation/profile.json`: `dd2bb3382e5c6d734f794104f1786c9038b9f6c9cb267d97748f5820d6a02bb9`
- `docs/trusted-dispatch-boundary.md`: `e5d4c6ba10fdf9d05021d973f6f1a7092a3693ac1a8204db801ebe2b547b88ab`
- `docs/user-docs/feature-map.md`: `c8c1b23e1856026fa2f375d9c7f0213603b253a1a3438c725ebc973b0fbc7a07`
- `docs/user-docs/manual/inspect-local-context.html`: `4b250fce9f923c870744cbb6f735ce57b62d9c39410770ff9d286ff2a08fcffd`
- `docs/user-docs/qa/inspect-local-context.html`: `d9b3a413c736d8cf6d182ef94b9c0ced1f56f6ec4562a957d32dd254a4e56f21`
- `docs/user-docs/releases/2026-09-15-original-action-results.html`: `17007b7a0a2a583135576a29562b5c502104a26ffcc102b91e0d7f50f086f831`
- `docs/user-docs/releases/index.html`: `0e59bab67f4e98dd613dfb367cb405681e35d747d40d28bda2ec0288e96d29b2`
- `scripts/generate-invocation-contracts.mjs`: `6ea0d46c4694089b653964993ae1986ad685d1cab6b8c01367415c4e71e601f7`
- `src/actions/action-service.js`: `88be61c499467137700c68724c4357767970dfcfdd706f34cedd0c15c67ec8d0`
- `src/actions/invocation-contracts.js`: `510a86b9d7dd56324a690a71dd24424dd7c11b509f6003376cea59dcfd3acc88`
- `src/actions/invocation-evidence.js`: `fb343fe54aa92f963046aee92f0f830f70310f6b447db782bf74dad1c14c593d`
- `src/gateway/gateway-service.js`: `7bf56a66fc3824fa5d82c5743d5d3fb19a265ded4042bdf2f7962ca5d15dda32`
- `src/http/gateway-server.js`: `cbf67a99c32621e89ff2934bbe82d01c6d80008b46a6e103f1e342da805e29ae`
- `test/action-gateway-http.test.js`: `a802f536e88add883e570c3f7abf421d11c89f88b5c99bd1e6627f74ffc3908f`
- `test/invocation-evidence.test.js`: `f11051b279faccfddc82ed5149b075e475f5218017b5f4cb635940b3cb559813`

## Validation log SHA-256

- `pwce-invocation-full.log`: `d74b5069c0cc4ac0b99035286569e00d69a530574a77853c09cf91668c910d50`
- `pwce-invocation-unit.log`: `a9217f5b01b710749fd6bf75b57ece5c75820a07193c997445237b6d5deb9b21`
- `pwce-invocation-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-invocation-pin.log`: `e8d6c06d343d2d5a678534c448421fe2275db72ab630e2e67c6d7ad6f535a552`
- `pwce-invocation-admission-pin.log`: `b09be31b79562f56f846444a1270edf3de8e761babda86139ae129b713c4c28f`
- `pwce-invocation-core-pin.log`: `80673133ed47f2a3deedb62e6c155f534604ed0fbcb5814785e06116d91d509f`
- `pwce-invocation-dispatch-pin.log`: `8426261699523d5e9ed950b159ba99bfb934e26ce15dca4c2545f5b4cf9ba161`
- `pwce-invocation-capability-pin.log`: `8692af66d32dd80c0d90dcd4d2ef70ec234ab885b59ba606b11b0b6c313222ee`
- `pwce-invocation-docs.log`: `89fb594b7b8ba3fc7c21aa0b1c812a17dcd9928317f965022b1fcd9d009f34d2`
- `pwce-invocation-lifestream-joined.log`: `bb869238766c6720fba096fb558123d39da300df98cd52dfab63561e7f03614f`
- `pwce-invocation-lifestream-context.log`: `cbe26154b9943f754ac795ecf28feede2a868c4bf8d276538ea613ab45c60538`
