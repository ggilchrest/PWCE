import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GatewayService } from '../src/gateway/gateway-service.js';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';

function setup(options = {}) {
  const store = new StateStore({ state: emptyState() }); let now = Date.now(), calls = 0;
  const clock = () => new Date(now);
  const actions = new ActionService({ store, clock, target: { identity: 'synthetic-snapshot-target', async invoke() { calls++; return { status: 'succeeded', externalEffectOccurred: true }; } } });
  actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
  const gateway = new GatewayService({ store, actionService: actions, clock, ...options });
  const token = 'synthetic-snapshot-test-token'; gateway.registerPrincipal({ principalRef: 'agent.fixture', token, siteRefs: ['home.one'] });
  const identity = { assistantRef: 'assistant.synthetic', endpointRef: 'endpoint.synthetic', participantRefs: ['participant.synthetic'], audienceRef: 'audience.synthetic' };
  const issue = (extra = {}) => gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token, siteRefs: ['home.one'], ...identity, ...extra });
  const authority = issue();
  const scope = { authorityContextRef: authority.authorityContextRef, worldRef: 'world.personal.v1', executionEnvironmentRef: 'test', ...identity };
  const request = (operation, extra = {}) => gateway.requestAuthenticated({ token, ...scope, operation, ...extra });
  const invoke = (extra = {}) => request('capabilities.invoke', { capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', capabilityOperation: 'light.set_level', siteRef: 'home.one', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, approvalRequired: false, idempotencyKey: 'synthetic-snapshot-action', ...extra });
  return { store, actions, gateway, scope, issue, request, invoke, calls: () => calls, advance: ms => { now += ms; } };
}
const error = code => value => value.code === code;

test('snapshot identity retains immutable original content without accumulating duplicate reads', async t => {
  const f = setup({ snapshotRetention: 1 }); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'); f.advance(1000);
  const again = await f.request('capabilities.getSnapshot');
  assert.equal(first.snapshotRef, again.snapshotRef); assert.equal(first.issuedAt, again.issuedAt);
  const selected = await f.request('capabilities.getSnapshot', { snapshotRef: first.snapshotRef });
  assert.deepEqual(selected.capabilities, first.capabilities);
  assert.throws(() => { first.capabilities[0].schemaVersion = '9.0.0'; }, TypeError);
  assert.equal((await f.request('capabilities.getSnapshot')).capabilities[0].schemaVersion, '1.0.0');
});

test('supplied missing, malformed and foreign snapshot references fail without acquiring replacements', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot');
  for (const snapshotRef of [null, '', 'not-a-snapshot', { value: first.snapshotRef }]) await assert.rejects(() => f.invoke({ snapshotRef }), error('invalid_request'));
  await assert.rejects(() => f.invoke({ snapshotRef: '00000000-0000-4000-8000-000000000001' }), error('snapshot_unavailable'));
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef, executionEnvironmentRef: 'replay' }), error('snapshot_unavailable'));
  const other = f.issue({ audienceRef: 'audience.other' });
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef, authorityContextRef: other.authorityContextRef, audienceRef: 'audience.other' }), error('snapshot_unavailable'));
  assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
});

test('every gateway invocation pins an actual retained snapshot before the effect', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot');
  const result = await f.invoke(); const state = await f.store.load(), binding = state.actions[result.actionRef].capabilitySnapshot;
  assert.equal(binding.snapshotRef, first.snapshotRef); assert.equal(binding.expiresAt, first.expiresAt);
  assert.equal(binding.sha256, createHash('sha256').update(binding.snapshotJson).digest('hex'));
  const retained = JSON.parse(binding.snapshotJson); assert.equal(retained.snapshot.snapshotRef, first.snapshotRef);
  assert.deepEqual(retained.snapshot.capabilities, first.capabilities); assert.equal(retained.scope[0], f.scope.authorityContextRef);
  assert.equal(result.status, 'completed'); assert.equal(f.calls(), 1);
  assert.equal((await f.invoke({ snapshotRef: first.snapshotRef })).actionRef, result.actionRef); assert.equal(f.calls(), 1);
});

test('a changed provider binding or catalog cannot use a retained snapshot with the same version', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'), original = f.actions.snapshot.bind(f.actions);
  f.actions.snapshot = () => ({ ...original(), bindingRef: 'synthetic-replacement-target' });
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_stale'));
  const second = await f.request('capabilities.getSnapshot'); assert.notEqual(second.snapshotRef, first.snapshotRef);
  f.actions.snapshot = () => { const next = original(); next.capabilities[0].approval = 'always'; return next; };
  await assert.rejects(() => f.invoke({ snapshotRef: second.snapshotRef }), error('snapshot_stale'));
  assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
});

test('snapshot capacity is bounded and does not evict an unexpired reference', async t => {
  const f = setup({ snapshotRetention: 1 }); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot');
  await assert.rejects(() => f.request('capabilities.getSnapshot', { executionEnvironmentRef: 'simulation' }), error('limit_exceeded'));
  assert.equal((await f.request('capabilities.getSnapshot', { snapshotRef: first.snapshotRef })).snapshotRef, first.snapshotRef);
  f.advance(300_000); const fresh = f.issue();
  const next = await f.request('capabilities.getSnapshot', { authorityContextRef: fresh.authorityContextRef }); assert.notEqual(next.snapshotRef, first.snapshotRef);
  await assert.rejects(() => f.invoke({ authorityContextRef: fresh.authorityContextRef, snapshotRef: first.snapshotRef }), error('snapshot_unavailable'));
});

test('expiry, backwards time and changed grant authority stop the original snapshot', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'); f.advance(-1);
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_expired')); f.advance(1);
  f.actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: [], capabilityRefs: [] });
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('authority_context_invalidated'));
  assert.equal(f.calls(), 0);
});

test('a source change queued before admission prevents the durable action and target call', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'), original = f.actions.authorizeDispatch.bind(f.actions), snapshot = f.actions.snapshot.bind(f.actions);
  f.actions.authorizeDispatch = async (request, context) => {
    f.actions.snapshot = () => ({ ...snapshot(), bindingRef: 'changed-before-admission' });
    return original(request, context);
  };
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_stale'));
  assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
});

test('a source change after admission cannot enter the target and preserves its original record', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'), original = f.actions.authorizeDispatch.bind(f.actions), snapshot = f.actions.snapshot.bind(f.actions);
  f.actions.authorizeDispatch = async (...args) => {
    const result = await original(...args); f.actions.snapshot = () => ({ ...snapshot(), bindingRef: 'changed-after-admission' }); return result;
  };
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_stale'));
  const actions = Object.values((await f.store.load()).actions); assert.equal(actions.length, 1);
  assert.equal(actions[0].status, 'admitted'); assert.equal(actions[0].capabilitySnapshot.snapshotRef, first.snapshotRef); assert.equal(f.calls(), 0);
  f.actions.authorizeDispatch = original;
  // A duplicate command can read that admission but may not resume I/O.
  assert.equal((await f.invoke()).status, 'admitted'); assert.equal(f.calls(), 0);
});

test('restarting the gateway cannot turn an old reference into new permission', async t => {
  const f = setup(); t.after(() => f.gateway.close()); const first = await f.request('capabilities.getSnapshot');
  const result = await f.invoke({ snapshotRef: first.snapshotRef }); f.gateway.close();
  const restarted = new GatewayService({ store: f.store, actionService: f.actions }); t.after(() => restarted.close());
  const token = 'synthetic-restarted-snapshot-token'; restarted.registerPrincipal({ principalRef: 'agent.fixture', token, siteRefs: ['home.one'] });
  const context = restarted.issueAuthorityContext({ principalRef: 'agent.fixture', token, siteRefs: ['home.one'] });
  await assert.rejects(() => restarted.requestAuthenticated({ token, ...context, operation: 'capabilities.getSnapshot', snapshotRef: first.snapshotRef }), error('snapshot_unavailable'));
  assert.equal((await f.store.load()).actions[result.actionRef].capabilitySnapshot.snapshotRef, first.snapshotRef); assert.equal(f.calls(), 1);
});

test('restoring catalog content or World identity does not revive an invalidated snapshot', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  const first = await f.request('capabilities.getSnapshot'), original = f.actions.snapshot.bind(f.actions);
  f.actions.snapshot = () => ({ ...original(), bindingRef: 'temporary-other-source' });
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_stale'));
  f.actions.snapshot = original;
  await assert.rejects(() => f.invoke({ snapshotRef: first.snapshotRef }), error('snapshot_stale'));
  const fresh = await f.request('capabilities.getSnapshot'); assert.notEqual(fresh.snapshotRef, first.snapshotRef);
  await f.store.transaction(state => { state.worldRef = 'world.other'; });
  await f.store.transaction(state => { state.worldRef = 'world.personal.v1'; });
  await assert.rejects(() => f.invoke({ snapshotRef: fresh.snapshotRef }), error('snapshot_stale'));
  assert.equal(f.calls(), 0);
});

test('missing or corrupt retained snapshot bytes cannot support a recorded action result', async t => {
  const f = setup(); t.after(() => f.gateway.close()); const result = await f.invoke();
  const original = (await f.store.load()).actions[result.actionRef].capabilitySnapshot;
  await f.store.transaction(state => { state.actions[result.actionRef].capabilitySnapshot.snapshotJson += ' '; });
  await assert.rejects(() => f.actions.getInvocation(result.actionRef), error('snapshot_evidence_corrupt'));
  await assert.rejects(() => f.invoke(), error('snapshot_evidence_corrupt')); assert.equal(f.calls(), 1);
  await f.store.transaction(state => { state.actions[result.actionRef].capabilitySnapshot = { ...original, snapshotJson: undefined }; });
  await assert.rejects(() => f.actions.getInvocation(result.actionRef), error('snapshot_evidence_corrupt'));
  await f.store.transaction(state => { state.actions[result.actionRef].capabilitySnapshot = null; });
  await assert.rejects(() => f.actions.getInvocation(result.actionRef), error('snapshot_evidence_corrupt'));
});

test('a direct dispatch cannot resume a gateway admission without its live snapshot guard', async t => {
  const f = setup(); t.after(() => f.gateway.close()); const original = f.actions.dispatch.bind(f.actions);
  f.actions.dispatch = async () => { throw new Error('synthetic interruption before dispatch'); };
  await assert.rejects(() => f.invoke(), /synthetic interruption/);
  const action = Object.values((await f.store.load()).actions)[0]; assert.equal(action.status, 'admitted');
  const result = await original(action.actionRef); assert.equal(result.status, 'denied');
  assert.equal(result.result.reasonCode, 'snapshot_binding_unavailable'); assert.equal(f.calls(), 0);
});

test('an empty retained catalog cannot dispatch through a still-registered action route', async t => {
  const f = setup(); t.after(() => f.gateway.close());
  f.actions.snapshot = () => ({ version: '1.0.0', capabilities: [], bindingRef: 'synthetic-no-capabilities' });
  const result = await f.invoke(); assert.equal(result.status, 'denied'); assert.deepEqual(result.rationaleCodes, ['capability_not_available']);
  assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
});
