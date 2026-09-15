# Development Batch 178 — Strict invocation-schema compatibility

Status: `verified` for the producer schema patch. Canonical Lifestream invocation/status integration remains in progress.

The current Lifestream strict schema compiler rejected the newly published invocation schema because two `required` constraints lacked an explicit object type. Version 1.0.1 makes those types explicit without changing which producer records are valid. Profile/bundle versions and the schema ID advance together; prior 1.0.0 history and evidence remain unchanged. Consumer validation is not relaxed. The producer test now compiles the complete schema using strict validation, matching the consuming worker.

Verification: 285/285 full PWCE tests, 10/10 focused invocation-proof tests, exact generation/digest checks, 36-page documentation link/anchor/style/index/QA checks and `git diff --check` pass. No runtime source, saved configuration, live effects, target, model or Human acceptance changed. Existing admission, capability and dispatch dependency pins remain unchanged.

Baseline `95aa6fa435c4978666480db2b0ae15c4cd457e9d`; this commit contains the patch. New bundle digest `dafcdadf33216ae5c27429a7687f46b4bad442eac0baf2eded683cc2e122ecc6`. Next adopt this exact consumer pin and continue original invocation/status custody.

## Source SHA-256

- `contracts/action-invocation/bundle-manifest.json`: `9c5af4957cb908159900379b0e96007dbccafd675a34e5d14ea4cc96cd0ea894`
- `contracts/action-invocation/evidence.schema.json`: `5f1b0e0a05a197f6216483a9192044e096d29ce811bb541ccfa6ddfd1d75be4c`
- `contracts/action-invocation/profile.json`: `c295a7e503237ec9da89e0da8265658e4b11c4621c7440b00f7d5976ac2e6856`
- `docs/trusted-dispatch-boundary.md`: `fcd925104829a6f7580115b717e5a7d3c18628ba25f04d779a2ac624f67fa1a1`
- `docs/user-docs/manual/inspect-local-context.html`: `e6f8f21de31a0992173617751bc538dffe8854bfa148289dc87423a8177e56ac`
- `docs/user-docs/qa/inspect-local-context.html`: `0dc172b6f86c5ab887f497ffbd6a1bccc70849915cfdd68bde92b4b0ef970f6b`
- `docs/user-docs/releases/2026-09-15-result-proof-compatibility.html`: `34e5f5426fae87d6cc911334d532603e23684ebff86a46760dad2bd867edbac8`
- `docs/user-docs/releases/index.html`: `bbd76542ac66d17d0b461266bfad4cacaf5b4f5d2bdae8bccd89c758bcbcbe1b`
- `scripts/generate-invocation-contracts.mjs`: `7113a784d48ca98bea01ffb2ee34118a602431a8eaac17ba3a6f9911df0a25ad`
- `src/actions/invocation-contracts.js`: `b6b4d6559db7ccaa77c53d6287601ddc1fe61047aa0f8c65a96593c48c89cdd5`
- `test/invocation-evidence.test.js`: `9efd43898b0102f75a13f9a43fd383bc5cba1566bc06431486e9b659aef6dec8`

## Logs

- `pwce-invocation-strict-full.log`: `ad4da47f363edc3a0b9500e5aa4a72cdc445e90e6dd357240c65034055694118`
- `pwce-invocation-strict-docs.log`: `5864de23b0788ed45f353301286976e99f1f62f9e4ddbf55d3c4fd3f7abb354a`
- `pwce-invocation-strict-unit.log`: `98f8268b8fa41bb932bd32b2382d6815eb385dd8bdccb6f14c1e204a283642d6`
- `pwce-invocation-strict-pin.log`: `4221ed77c5032b28416f4c54e4fe61f84be30f2cc57655a4fcaabe40af271b80`
