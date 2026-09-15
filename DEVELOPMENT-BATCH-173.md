# Development Batch 173 — Authenticated trusted-dispatch transport

Status: `verified` for the producer transport; full configured Lifestream action integration remains `inProgress`.

The trusted dispatcher now has an explicit HTTP boundary requiring both the original scoped Agent bearer credential and a distinct host-only dispatcher credential. Startup rejects missing Agent authentication, reused credentials, short/oversized or header-unsafe secrets. The normal Agent route never selects trusted dispatch from request fields. The separate routes are disabled by default and reject browser Origin requests.

`pwce-trusted-dispatch.v1@1.0.0` is a separate public transport extension with a generated digest-pinned bundle. It declares its exact unchanged core Gateway dependency. The request schema requires explicit identity, world/environment, request/correlation, deadline, snapshot, capability/version, target, parameters, key and approval fields. Invocation additionally requires the original action reference. Unknown fields and body credentials fail closed. Every mutation must present the exact dispatch bundle digest; incompatible callers receive 409 before admission. Both phases preserve the producer's actual result and scoped metadata.

This publishes an additional trusted transport, not a changed core domain record or a replacement Gateway profile. Core bundle `pwce-agent-gateway.bundle.v1@1.0.0` remains byte-identical. The consumer still needs its extension pin and canonical mapping; historical core compatibility alone cannot qualify dispatch transport.

## Verification

- `npm test`: 265 pass, zero failures/skips; includes ten new contract/real-HTTP tests plus the fourteen internal split-path cases from Batch 172 and existing real password approval tests.
- New HTTP tests verify both credentials, disabled routes, browser denial, wrong digest/version/method/content type, malformed JSON, every required field, unknown credential fields, published bounds, missing action identity, changed authority, concurrent/repeated execution and unknown outcome preservation. Synthetic targets only.
- `npm run validate`: 13 foundation fixtures and three manifest checks pass.
- `node scripts/generate-dispatch-bundle.mjs`: exact artifact hashes and generated extension match; full tests independently recompute the aggregate and verify the core dependency.
- `npm run generate:gateway-bundle`: unchanged core artifacts/client.
- Documentation checker: 32 HTML pages pass local links/anchors, screenshot references/alt text, shared styles, feature map/index and affected release/QA links. No UI controls changed; no recapture needed.
- `git diff --check`: pass.

## Scope and limits

No saved service or live configuration was changed, no real device was contacted, and no personal data, training, model/provider selection or Human acceptance occurred. Secrets in these tests are synthetic and do not appear in stored action/audit data. The producer uses its existing bounded transport, current context, approval, target and single-claim dispatcher. It does not automatically retry uncertain effects.

Next: generate and verify Lifestream's public extension dependency pin and bounded client, then complete canonical authority/capability/evidence mapping and configured joined scenarios. Source baseline: `507cef76d77c0b0f43977898945386d2ab58827c`; the enclosing commit binds this source. Raw logs are preserved locally in `lifestream/.lifestream/benchmarks/pwce-dispatch-transport/2026-09-15`.

## Source SHA-256

- `contracts/gateway-dispatch/bundle-manifest.json`: `4f5a47ff1eb56defeac9507bcc05a5ed8c1ecacb5d17797a0523db2b2a925eb4`
- `contracts/gateway-dispatch/request.schema.json`: `a727b6cb9f1db9252075d32ce4e3826f036a700c4bc7d6742d9a92eeba25443e`
- `contracts/gateway-dispatch/response.schema.json`: `0ba4d439853235e9638a4d405383c3753f52af12182b00c282a60997b3b13b62`
- `contracts/gateway-dispatch/transport.json`: `89b51459b788f49cfbea04b43121f216c477c79e0248dae525a664e305095bbe`
- `docs/trusted-dispatch-boundary.md`: `ab6dd0203997090a17ebbd0bfe8dfd5eb83216e56623eb78af4a2577efca568f`
- `docs/user-docs/feature-map.md`: `41640d1caee4862e59e5381690156a0cfb457fcff72fd64a988a3647f8ba0fc1`
- `docs/user-docs/manual/inspect-local-context.html`: `528cb7c2dc62bbad6b272dd51eb820f5e6eb8cf60dc50449f5a826c7a55ee54c`
- `docs/user-docs/qa/inspect-local-context.html`: `eec3ac97509433e993c8a1443202461c072576b16dd06999539a20e027720baa`
- `docs/user-docs/releases/2026-09-15-trusted-action-transport.html`: `c7d3871a9e5b652af034329728635d341542c3f5df58d27b97bd016b83f223eb`
- `docs/user-docs/releases/index.html`: `159808b07e6610e6b104c331ebabd8476b49b73e04ef92f8a87de8907288010c`
- `scripts/generate-dispatch-bundle.mjs`: `52c7153a18e63a5bea3462a537e8c11a6ecf85453ea2cdb5636e304c2c00612c`
- `src/gateway/dispatch-bundle.js`: `db091c60b6f30a819e2e0bbadef08efb59c94dea5c7ec9acfe8e9cebbf3da1b7`
- `src/http/dev-server.js`: `500ef2ef1cac53d9f2a4fe6294948cebf197169b6834930ce2a7f4fcf380e21c`
- `src/http/dispatch-contract.js`: `7403df81ed407f6337be658b67bb8e998224a61bdc10144c3765e53b463986d8`
- `src/http/gateway-server.js`: `7f7202deb8a0f2a62255b9199dfec2afe857267285c0c3f6a135f955fa020ad4`
- `test/gateway-dispatch-http.test.js`: `41090c3c103dba5a18ac49b8070f08e6698910dd6e137b5343dc1a715377890d`

## Log SHA-256

- `pwce-dispatch-full.log`: `03cc676f388bc97b0067cc48e459b19bbef16fb4815bc31366a2b70b3ca6569a`
- `pwce-dispatch-http.log`: `b63defd89784fd2bb79ed3ba5926087930396d196c01fcf82725120a5663a0e5`
- `pwce-dispatch-bundle.log`: `8426261699523d5e9ed950b159ba99bfb934e26ce15dca4c2545f5b4cf9ba161`
- `pwce-dispatch-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-dispatch-core.log`: `45fe2ceba9163ec01a876ec5d733d3fdcff413171e999a0645f26ef1288c048d`
- `pwce-dispatch-docs.log`: `ba62cae3237d52b7e792b3f79e9d1147e64f81cf776b2d80289110bcdb51b8a0`
