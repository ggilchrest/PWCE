# Trusted Gateway admission and invocation

`GatewayService.requestTrustedDispatch` is an internal host API for the trusted dispatcher. It is not exposed through the Agent Gateway HTTP binding. The ordinary `/gateway/v1/request` route continues to reject `authority.authorizeDispatch`, including requests containing `trusted`, `trustedDispatch` or `phase` fields. Do not select this host API using a field in an Agent request. A future transport must separately authenticate the trusted dispatcher and publish its versioned contract before a remote adapter uses it.

The host calls the two phases with the original Agent token, current authority context, identity, world, execution mode, explicit retained snapshot, exact action parameters and idempotency key:

1. `authority.authorizeDispatch` checks the producer's policy, grant, approval, snapshot and target preconditions and commits the admission. The response contains the producer's stored `admission`, its `actionRef`, original `decision`, current action status and duplicate flag. It does not call the target. Approval-required responses retain the existing pending Human review workflow; approval alone does not admit or dispatch.
2. `capabilities.invoke` additionally requires that original `actionRef`. It resolves the existing action and verifies the same normalized request, idempotency key, approval requirements/reference and exact retained snapshot before calling the producer's single-claim dispatcher. It never calls admission or creates a replacement action.

Both phases authenticate and recheck current context, identity, grant revision, snapshot and deadline after asynchronous work. Invocation cannot extend the original action deadline. The dispatcher retains its existing approval recheck, fresh target check, durable started marker and uncertain-outcome behavior.

Repeated admission returns the original record. The ordinary combined Gateway invocation cannot start an action already admitted through the split path: its duplicate handling remains a read. Repeated trusted invocation uses the original durable attempt; concurrent calls share one dispatch and unknown results remain unknown. Status reconciliation remains the existing read operation and cannot authorize a new effect.

The stored record is producer admission evidence, not a Lifestream `AuthorityDispatchResult`, a remote credential, or confirmation of an effect. No Lifestream receipt is manufactured here. Public bundle bytes and the existing 1.0.0 Gateway wire contract are unchanged.

## Remaining integration

The configured Lifestream path still needs the separately authenticated trusted transport, producer contract publication and digest lock, canonical authority/capability mapping, admission evidence mapping, and joined action verification. This internal prerequisite does not make that path usable or verified. Contexts and snapshot custody remain process-local: a fresh Gateway process cannot dispatch an old admission using reconstructed context or a replacement snapshot. Read-only outcome recovery must remain distinct from permission to send a command.

Tests in `test/gateway-trusted-dispatch.test.js` use synthetic targets and synthetic host approval proof. They do not establish physical effects, selected-provider behavior, or Human acceptance.
