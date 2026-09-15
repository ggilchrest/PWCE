import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { ApprovalService } from '../src/actions/approval-service.js';
import { GatewayService } from '../src/gateway/gateway-service.js';

async function setup(t, targetResult = { status: 'succeeded', externalEffectOccurred: true }) {
  let now = new Date('2026-09-15T12:00:00.000Z'), calls = 0;
  const clock = () => now, store = new StateStore({ state: emptyState() });
  const target = { identity: 'synthetic.trusted-dispatch', async invoke() { calls++; return targetResult; } };
  const approvals = new ApprovalService({ store, clock });
  const actions = new ActionService({ store, target, clock, approvalService: approvals });
  const grant = { principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] };
  actions.registerGrant(grant);
  const gateway = new GatewayService({ store, actionService: actions, clock });
  t.after(() => gateway.close());
  const token = 'synthetic-trusted-dispatch-token';
  gateway.registerPrincipal({ principalRef: grant.principalRef, token, siteRefs: grant.siteRefs });
  const identity = { assistantRef: 'assistant.synthetic', endpointRef: 'endpoint.synthetic', participantRefs: ['participant.synthetic'], audienceRef: 'audience.synthetic' };
  const authority = gateway.issueAuthorityContext({ ...grant, token, ...identity });
  const scope = { authorityContextRef: authority.authorityContextRef, ...identity, worldRef: 'world.personal.v1', executionEnvironmentRef: 'test' };
  const snapshot = await gateway.requestAuthenticated({ token, ...scope, operation: 'capabilities.getSnapshot' });
  const request = { token, ...scope, snapshotRef: snapshot.snapshotRef, siteRef: 'home.one', capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', capabilityOperation: 'light.set_level', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, approvalRequired: false, idempotencyKey: 'synthetic-split-action' };
  const admit = (overrides = {}) => gateway.requestTrustedDispatch({ ...request, operation: 'authority.authorizeDispatch', ...overrides });
  const invoke = (actionRef, overrides = {}) => gateway.requestTrustedDispatch({ ...request, operation: 'capabilities.invoke', actionRef, ...overrides });
  return { gateway, store, actions, approvals, grant, request, admit, invoke, calls: () => calls, advance: ms => { now = new Date(now.valueOf() + ms); } };
}

test('trusted admission persists the producer record without dispatch; explicit invocation claims once', async t => {
  const f = await setup(t);
  const first = await f.admit();
  assert.equal(first.status, 'admitted'); assert.equal(first.duplicate, false); assert.equal(f.calls(), 0);
  assert.deepEqual(first.admission, (await f.store.load()).actions[first.actionRef]);
  const duplicate = await f.admit();
  assert.equal(duplicate.actionRef, first.actionRef); assert.equal(duplicate.duplicate, true); assert.equal(f.calls(), 0);
  const ordinary = await f.gateway.requestAuthenticated({ ...f.request, operation: 'capabilities.invoke' });
  assert.equal(ordinary.status, 'admitted'); assert.equal(f.calls(), 0);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.invoke(first.actionRef)));
  assert.ok(results.every(result => result.status === 'completed' && result.actionRef === first.actionRef));
  assert.equal(f.calls(), 1);
  const after = await f.admit(); assert.equal(after.status, 'succeeded'); assert.equal(after.duplicate, true);
  assert.equal(f.calls(), 1);
  const audit = (await f.store.load()).audit;
  assert.equal(audit.filter(event => event.type === 'action.admitted').length, 1);
  assert.equal(audit.filter(event => event.type === 'action.started').length, 1);
});

test('ordinary calls cannot claim trusted dispatch through JSON or extra arguments', async t => {
  const f = await setup(t);
  for (const flags of [{ trustedDispatch: true }, { phase: 'admit' }, { trusted: true }]) {
    await assert.rejects(f.gateway.requestAuthenticated({ ...f.request, ...flags, operation: 'authority.authorizeDispatch' }), { code: 'trusted_dispatch_only' });
    await assert.rejects(f.gateway.request({ ...f.request, ...flags, operation: 'authority.authorizeDispatch' }, true), { code: 'trusted_dispatch_only' });
  }
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('trusted entry still requires authentication, a current context, and an explicit snapshot', async t => {
  const f = await setup(t);
  await assert.rejects(f.admit({ token: 'wrong' }), { code: 'authentication_failed' });
  await assert.rejects(f.admit({ snapshotRef: undefined }), { code: 'invalid_request' });
  await assert.rejects(f.admit({ operation: 'health.get' }), { code: 'unsupported_operation' });
  await assert.rejects(f.admit({ audienceRef: 'audience.other' }), { code: 'scope_denied' });
  await assert.rejects(f.admit({ siteRef: 'home.other' }), { code: 'scope_denied' });
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('missing and changed original admissions never create an action or dispatch', async t => {
  const f = await setup(t), admitted = await f.admit();
  for (const changed of [
    { actionRef: 'missing' }, { idempotencyKey: 'changed' }, { parameters: { level: 0.8 } },
    { targetEntityId: 'light.other' }, { approvalRequired: true }, { approvalRef: 'other' }
  ]) await assert.rejects(f.invoke(admitted.actionRef, changed), { code: 'admission_mismatch' });
  await assert.rejects(f.invoke(undefined), { code: 'invalid_request' });
  assert.equal(Object.keys((await f.store.load()).actions).length, 1);
  assert.equal((await f.store.load()).actions[admitted.actionRef].status, 'admitted'); assert.equal(f.calls(), 0);
});

test('changed admission input conflicts and preserves the first record', async t => {
  const f = await setup(t), admitted = await f.admit();
  await assert.rejects(f.admit({ parameters: { level: 0.8 } }), { code: 'idempotency_conflict' });
  assert.deepEqual((await f.store.load()).actions[admitted.actionRef].parameters, { level: 0.5 });
  assert.equal(f.calls(), 0);
});

test('grant replacement after admission fences the later invocation', async t => {
  const f = await setup(t), admitted = await f.admit();
  f.actions.registerGrant(f.grant);
  await assert.rejects(f.invoke(admitted.actionRef), { code: 'authority_context_invalidated' });
  assert.equal(f.calls(), 0);
});

test('expired context cannot dispatch and a fresh request deadline cannot extend original admission', async t => {
  const f = await setup(t), admitted = await f.admit();
  f.advance(30_001);
  const result = await f.invoke(admitted.actionRef, { deadline: '2026-09-15T12:04:00.000Z' });
  assert.equal(result.status, 'denied'); assert.equal(result.result.reasonCode, 'dispatch_deadline_exceeded');
  assert.equal(f.calls(), 0);
  f.advance(300_000);
  await assert.rejects(f.invoke(admitted.actionRef), { code: 'authority_context_expired' });
});

test('lost provider reply stays unknown through admission and invocation retries', async t => {
  const f = await setup(t, { status: 'outcome_unknown', externalEffectOccurred: 'unknown', reasonCode: 'synthetic_lost_reply' });
  const admitted = await f.admit();
  assert.equal((await f.invoke(admitted.actionRef)).status, 'outcome_unknown');
  assert.equal((await f.admit()).status, 'outcome_unknown');
  assert.equal((await f.invoke(admitted.actionRef)).status, 'outcome_unknown');
  assert.equal(f.calls(), 1);
});

test('authority replaced while the original admission is being read prevents dispatch', async t => {
  const f = await setup(t), admitted = await f.admit();
  const read = f.actions.getInvocation.bind(f.actions);
  f.actions.getInvocation = async ref => { const result = await read(ref); f.actions.registerGrant(f.grant); return result; };
  await assert.rejects(f.invoke(admitted.actionRef), { code: 'authority_context_invalidated' });
  assert.equal(f.calls(), 0); assert.equal((await f.store.load()).actions[admitted.actionRef].status, 'admitted');
});

test('a changed provider snapshot between phases cannot dispatch the admitted action', async t => {
  const f = await setup(t), admitted = await f.admit();
  const snapshot = f.actions.snapshot.bind(f.actions);
  f.actions.snapshot = () => ({ ...snapshot(), bindingRef: 'synthetic.replacement' });
  await assert.rejects(f.invoke(admitted.actionRef), { code: 'snapshot_stale' });
  assert.equal(f.calls(), 0);
});

test('another valid audience context cannot use the original admission with its own snapshot', async t => {
  const f = await setup(t), admitted = await f.admit();
  const identity = { assistantRef: f.request.assistantRef, endpointRef: f.request.endpointRef, participantRefs: f.request.participantRefs, audienceRef: 'audience.other' };
  const other = f.gateway.issueAuthorityContext({ ...f.grant, token: f.request.token, ...identity });
  const scope = { ...identity, authorityContextRef: other.authorityContextRef };
  const snapshot = await f.gateway.requestAuthenticated({ ...f.request, ...scope, snapshotRef: undefined, operation: 'capabilities.getSnapshot' });
  await assert.rejects(f.invoke(admitted.actionRef, { ...scope, snapshotRef: snapshot.snapshotRef }), { code: 'admission_mismatch' });
  assert.equal(f.calls(), 0);
});

test('approval is separate from admission, and expiry between phases prevents the effect', async t => {
  const f = await setup(t);
  const pending = await f.admit({ approvalRequired: true });
  assert.equal(pending.status, 'approval_required');
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
  const approval = pending.approval;
  // Synthetic host proof tests the producer service. It is not a Human review.
  await f.approvals.approve({ approvalRef: approval.approvalRef, approvedBy: 'human.synthetic', confirmationDigest: approval.confirmationDigest,
    humanProof: { principalRef: 'human.synthetic', authenticationMethod: 'password', authenticatedAt: '2026-09-15T12:00:00.000Z', verifiedAt: '2026-09-15T12:00:00.000Z' } });
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
  f.advance(119_500);
  const fields = { approvalRequired: true, approvalRef: approval.approvalRef };
  const admitted = await f.admit(fields);
  assert.equal(admitted.status, 'admitted'); assert.equal(f.calls(), 0);
  f.advance(600);
  const result = await f.invoke(admitted.actionRef, fields);
  assert.equal(result.status, 'denied'); assert.equal(result.result.reasonCode, 'approval_invalid_or_expired');
  assert.equal(f.calls(), 0);
});

test('a fresh Gateway cannot turn an old admission into a new dispatch using reconstructed context', async t => {
  const f = await setup(t), admitted = await f.admit();
  const gateway = new GatewayService({ store: f.store, actionService: f.actions, clock: () => new Date('2026-09-15T12:00:01.000Z') });
  t.after(() => gateway.close());
  gateway.registerPrincipal({ ...f.grant, token: f.request.token });
  await assert.rejects(gateway.requestTrustedDispatch({ ...f.request, operation: 'capabilities.invoke', actionRef: admitted.actionRef }), { code: 'authentication_failed' });
  const identity = { assistantRef: f.request.assistantRef, endpointRef: f.request.endpointRef, participantRefs: f.request.participantRefs, audienceRef: f.request.audienceRef };
  const context = gateway.issueAuthorityContext({ ...f.grant, token: f.request.token, ...identity });
  const request = { ...f.request, authorityContextRef: context.authorityContextRef, snapshotRef: undefined };
  const snapshot = await gateway.requestAuthenticated({ ...request, operation: 'capabilities.getSnapshot' });
  request.snapshotRef = snapshot.snapshotRef;
  assert.notEqual(snapshot.snapshotRef, admitted.admission.capabilitySnapshot.snapshotRef);
  const duplicate = await gateway.requestTrustedDispatch({ ...request, operation: 'authority.authorizeDispatch' });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.actionRef, admitted.actionRef);
  assert.equal(duplicate.admission.capabilitySnapshot.snapshotRef, admitted.admission.capabilitySnapshot.snapshotRef);
  await assert.rejects(gateway.requestTrustedDispatch({ ...request, operation: 'capabilities.invoke', actionRef: admitted.actionRef }), { code: 'admission_mismatch' });
  assert.equal((await gateway.requestAuthenticated({ ...request, operation: 'capabilities.invoke' })).status, 'admitted');
  assert.equal(f.calls(), 0); assert.equal(Object.keys((await f.store.load()).actions).length, 1);
});

test('stored arguments that disagree with the original fingerprint do not reach the target', async t => {
  const f = await setup(t), admitted = await f.admit();
  await f.store.transaction(state => { state.actions[admitted.actionRef].parameters = { level: 0.9 }; });
  await assert.rejects(f.invoke(admitted.actionRef), { code: 'admission_mismatch' });
  assert.equal(f.calls(), 0);
});
