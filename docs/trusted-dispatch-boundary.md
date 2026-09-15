# Trusted Gateway admission and invocation

`GatewayService.requestTrustedDispatch` is an internal host API for the trusted dispatcher. The ordinary Agent request route does not expose this method. The separately authenticated dispatch transport below invokes it. The ordinary `/gateway/v1/request` route continues to reject `authority.authorizeDispatch`, including requests containing `trusted`, `trustedDispatch` or `phase` fields. Do not select this host API using a field in an Agent request. The dedicated transport separately authenticates the dispatcher and requires its published contract digest.

The host calls the two phases with the original Agent token, current authority context, identity, world, execution mode, explicit retained snapshot, exact action parameters and idempotency key:

1. `authority.authorizeDispatch` checks the producer's policy, grant, approval, snapshot and target preconditions and commits the admission. The response contains the producer's stored `admission`, its `actionRef`, original `decision`, current action status and duplicate flag. It does not call the target. Approval-required responses retain the existing pending Human review workflow; approval alone does not admit or dispatch.
2. `capabilities.invoke` additionally requires that original `actionRef`. It resolves the existing action and verifies the same normalized request, idempotency key, approval requirements/reference and exact retained snapshot before calling the producer's single-claim dispatcher. It never calls admission or creates a replacement action.

Both phases authenticate and recheck current context, identity, grant revision, snapshot and deadline after asynchronous work. Invocation cannot extend the original action deadline. The dispatcher retains its existing approval recheck, fresh target check, durable started marker and uncertain-outcome behavior.

Repeated admission returns the original record. The ordinary combined Gateway invocation cannot start an action already admitted through the split path: its duplicate handling remains a read. Repeated trusted invocation uses the original durable attempt; concurrent calls share one dispatch and unknown results remain unknown. Status reconciliation remains the existing read operation and cannot authorize a new effect.

The stored record is producer admission evidence, not a Lifestream `AuthorityDispatchResult`, a remote credential, or confirmation of an effect. No Lifestream receipt is manufactured here. The core Gateway bundle bytes and existing 1.0.0 request route are unchanged. The separate dispatch transport has its own versioned bundle and exact core dependency.

## Remaining integration

The configured Lifestream path still needs the consumer digest lock, canonical authority/capability mapping, admission evidence mapping, and joined action verification. This internal prerequisite does not make that path usable or verified. Contexts and snapshot custody remain process-local: a fresh Gateway process cannot dispatch an old admission using reconstructed context or a replacement snapshot. Read-only outcome recovery must remain distinct from permission to send a command.

Tests in `test/gateway-trusted-dispatch.test.js` use synthetic targets and synthetic host approval proof. They do not establish physical effects, selected-provider behavior, or Human acceptance.

## Authenticated transport

The public extension is `pwce-trusted-dispatch.v1@1.0.0`, in `contracts/gateway-dispatch`. Its bundle pins the transport description and request/response schemas, and requires the existing exact core Gateway bundle. Regenerate it with `node scripts/generate-dispatch-bundle.mjs --write`; omission of `--write` checks byte identity.

Startup may configure `PWCE_GATEWAY_DISPATCHER_TOKEN`: a 32–512 character printable ASCII secret, distinct from the Agent and Studio credentials. Absence disables the dispatch routes; this is never inferred from the ordinary token. Keep this secret in the trusted host configuration, outside model context, requests, browsers and source control. Adding the code does not configure or restart a saved deployment.

- `GET /gateway/v1/dispatch/bundle` requires `Authorization: Bearer <Agent token>` and `X-PWCE-Dispatcher-Token: <dispatcher secret>`.
- `POST /gateway/v1/dispatch` requires both credentials, JSON content type, and `X-PWCE-Dispatch-Contract` equal to the negotiated bundle digest. Wrong digest returns 409 before admission.
- A request with an `Origin` header is rejected. Only the separately configured host transport should hold the dispatcher secret.
- The request must supply both dispatch profile fields, the full core profile/identity/request/correlation/world/environment/deadline envelope, original retained snapshot, capability/version/operation, target/site/parameters, key and approval fields. Nullable identity and approval references must be explicit. Only invocation supplies `actionRef`.
- Unknown fields, body credentials, unsupported operations, duplicate participants, missing values and published bound violations are rejected before admission. The same 1 MiB transport cap applies. The response adds the dispatch profile identity to the original producer result. No automatic retry occurs in the producer.
