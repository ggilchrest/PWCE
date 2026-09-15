import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayApprovalFixture } from '../scripts/fixtures/gateway-approval.mjs';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { HomeAssistantActionTarget } from '../src/actions/home-assistant-target.js';
import { HomeAssistantAdapter } from '../src/adapters/home-assistant-adapter.js';
import { FixtureActionTarget } from '../src/actions/fixture-target.js';

const request = (extra = {}) => ({ principalRef: 'agent.synthetic', capabilityRef: 'home.light.set_level', operation: 'light.set_level', siteRef: 'home.synthetic', targetEntityId: 'light.synthetic', parameters: { level: 0.4 }, executionEnvironmentRef: 'live', idempotencyKey: 'synthetic-preconditions', ...extra });
const available = () => ({ allowed: true, reasonCode: 'target_available', observed: null });
const register = actions => actions.registerGrant({ principalRef: 'agent.synthetic', siteRefs: ['home.synthetic'], capabilityRefs: ['home.light.set_level'] });
function setup(options = {}) {
  const store = new StateStore({ state: emptyState() });
  const state = { entity_id: 'light.synthetic', state: 'on', last_updated: '2020-01-01T00:00:00Z', attributes: { brightness: 102 } };
  const calls = [];
  const adapter = new HomeAssistantAdapter({ store, config: { siteRef: 'home.synthetic', sourceRef: 'ha.synthetic', baseUrl: 'http://synthetic.invalid', tokenRef: 'secret://synthetic' }, resolveToken: async () => 'synthetic-token', fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method ?? 'GET' });
    return new Response(JSON.stringify(init.method === 'POST' ? [] : state), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const target = options.target ?? new HomeAssistantActionTarget({ adapter });
  const actions = new ActionService({ store, target, liveEffectsEnabled: true, ...options }); register(actions);
  return { store, state, calls, actions, target };
}

test('fresh Home Assistant reads bracket admission and dispatch; acknowledgment remains uncertain', async () => {
  const e = setup(); const admitted = await e.actions.authorizeDispatch(request());
  assert.equal(admitted.action.preconditionChecks.length, 1);
  assert.equal(admitted.action.preconditionChecks[0].result.observed.state, 'on');
  const result = await e.actions.dispatch(admitted.action.actionRef);
  assert.deepEqual(e.calls.map(c => c.method), ['GET', 'GET', 'POST']);
  assert.ok(e.calls[0].url.endsWith('/api/states/light.synthetic'));
  assert.equal(result.status, 'outcome_unknown');
  assert.deepEqual(result.preconditionChecks.map(c => c.phase), ['admission', 'dispatch']);
  assert.equal((await e.actions.getInvocation(result.actionRef)).preconditionChecks.length, 2);
});

for (const [name, change, reason] of [
  ['unavailable', { state: 'unavailable' }, 'target_state_unavailable'],
  ['unknown', { state: 'unknown' }, 'target_state_unavailable'],
  ['wrong entity', { entity_id: 'light.other' }, 'target_state_scope_mismatch'],
  ['invalid timestamp', { last_updated: 'invalid' }, 'target_state_time_invalid'],
  ['future timestamp', { last_updated: '2999-01-01T00:00:00Z' }, 'target_state_time_invalid']
]) test(`Home Assistant ${name} state prevents admission and sends no command`, async () => {
  const e = setup(); Object.assign(e.state, change);
  const result = await e.actions.authorizeDispatch(request());
  assert.equal(result.action, null); assert.deepEqual(result.decision.rationaleCodes, [reason]);
  assert.deepEqual(e.calls.map(c => c.method), ['GET']);
  assert.equal(Object.keys((await e.store.load()).actions).length, 0);
});

test('non-light entity is rejected before a Home Assistant read', async () => {
  const e = setup(); const result = await e.actions.authorizeDispatch(request({ targetEntityId: 'switch.synthetic' }));
  assert.equal(result.action, null); assert.equal(e.calls.length, 0);
});

test('changed target state after admission denies dispatch and retains both checks', async () => {
  const e = setup(); const admitted = await e.actions.authorizeDispatch(request()); e.state.state = 'unavailable';
  const result = await e.actions.dispatch(admitted.action.actionRef);
  assert.equal(result.status, 'denied'); assert.equal(result.result.externalEffectOccurred, false);
  assert.equal(result.result.reasonCode, 'target_state_unavailable');
  assert.deepEqual(result.preconditionChecks.map(c => c.result.allowed), [true, false]);
  assert.deepEqual(e.calls.map(c => c.method), ['GET', 'GET']);
  await e.actions.dispatch(result.actionRef); assert.equal(e.calls.length, 2);
});

test('idempotent resume reads the original uncertain result even when the target becomes unavailable', async () => {
  const e = setup(); const admitted = await e.actions.authorizeDispatch(request());
  const original = await e.actions.dispatch(admitted.action.actionRef); e.state.state = 'unavailable';
  const replay = await e.actions.authorizeDispatch(request());
  assert.equal(replay.duplicate, true); assert.deepEqual(replay.action, original);
  await e.actions.dispatch(replay.action.actionRef); assert.equal(e.calls.length, 3);
  await assert.rejects(e.actions.authorizeDispatch(request({ parameters: { level: 0.7 } })), { code: 'idempotency_conflict' });
  assert.equal(e.calls.length, 3);
});

test('live routing requires a target precondition implementation; fixtures cannot satisfy it', async () => {
  for (const target of [{ async invoke() { assert.fail('must not invoke'); } }, new FixtureActionTarget()]) {
    const e = setup({ target }); const result = await e.actions.authorizeDispatch(request());
    assert.equal(result.action, null); assert.equal(result.decision.outcome, 'denied');
  }
});

test('late target preconditions time out, are aborted and cannot produce an action', async () => {
  let resolve, signal;
  const e = setup({ preconditionTimeoutMs: 10, target: { checkPreconditions(_request, context) { signal = context.signal; return new Promise(done => { resolve = done; }); }, async invoke() { assert.fail('must not invoke'); } } });
  const result = await e.actions.authorizeDispatch(request());
  assert.equal(result.action, null); assert.equal(signal.aborted, true);
  resolve(available()); await new Promise(done => setImmediate(done));
  assert.equal(Object.keys((await e.store.load()).actions).length, 0);
});

test('lossy or target-authored host metadata cannot serve as precondition evidence', async () => {
  for (const value of [null, { ...available(), checkedAt: '2026-01-01T00:00:00Z' }, { ...available(), observed: { invalid: NaN } }, { ...available(), observed: 'x'.repeat(9000) }, { ...available(), get observed() { throw new Error('getter'); } }]) {
    const e = setup({ target: { async checkPreconditions() { return value; }, async invoke() { assert.fail('must not invoke'); } } });
    const result = await e.actions.authorizeDispatch(request()); assert.equal(result.action, null);
    assert.deepEqual(result.decision.rationaleCodes, ['target_preconditions_unavailable']);
  }
});

test('grant withdrawal during admission and dispatch reads prevents effects', async () => {
  for (const withdrawOn of [1, 2]) {
    let reads = 0, e;
    e = setup({ target: { async checkPreconditions() { if (++reads === withdrawOn) e.actions.registerGrant({ principalRef: 'agent.synthetic', siteRefs: [], capabilityRefs: [] }); return available(); }, async invoke() { assert.fail('must not invoke'); } } });
    const admitted = await e.actions.authorizeDispatch(request());
    if (withdrawOn === 1) assert.equal(admitted.action, null);
    else assert.equal((await e.actions.dispatch(admitted.action.actionRef)).status, 'denied');
  }
});

test('dispatch check is durable before invocation and tampering prevents later reads', async () => {
  let e;
  e = setup({ target: { identity: 'synthetic-target', async checkPreconditions() { return available(); }, async invoke(action) {
    assert.equal((await e.store.load()).actions[action.actionRef].preconditionChecks.length, 2);
    return { status: 'outcome_unknown', externalEffectOccurred: 'unknown' };
  } } });
  const admitted = await e.actions.authorizeDispatch(request()); await e.actions.dispatch(admitted.action.actionRef);
  await e.store.transaction(state => { state.actions[admitted.action.actionRef].preconditionChecks[1].result.allowed = false; });
  await assert.rejects(e.actions.getInvocation(admitted.action.actionRef), { code: 'precondition_evidence_corrupt' });
  await assert.rejects(e.actions.dispatch(admitted.action.actionRef), { code: 'precondition_evidence_corrupt' });
});

test('failed persistence of the dispatch check prevents invocation and leaves a claimed attempt', async () => {
  let checks = 0, e;
  e = setup({ target: { async checkPreconditions() { if (++checks === 2) e.store.transaction = async () => { throw new Error('synthetic disk failure'); }; return available(); }, async invoke() { assert.fail('must not invoke'); } } });
  const admitted = await e.actions.authorizeDispatch(request());
  await assert.rejects(e.actions.dispatch(admitted.action.actionRef), /synthetic disk failure/);
  const stored = await e.actions.getInvocation(admitted.action.actionRef);
  assert.equal(stored.status, 'started'); assert.ok(stored.attemptRef); assert.equal(stored.preconditionChecks.length, 1);
});

test('approval expiry during the final target read prevents the command', async () => {
  let now = new Date('2026-09-15T12:00:00Z'), reads = 0;
  const e = setup({ clock: () => now, approvalService: { async verify() { return now < new Date('2026-09-15T12:00:01Z'); } }, target: {
    async checkPreconditions() { if (++reads === 2) now = new Date('2026-09-15T12:00:02Z'); return available(); },
    async invoke() { assert.fail('expired approval must not invoke'); }
  } });
  const admitted = await e.actions.authorizeDispatch(request({ approvalRequired: true, approvalRef: 'synthetic-approved' }));
  const result = await e.actions.dispatch(admitted.action.actionRef);
  assert.equal(result.status, 'denied'); assert.equal(result.result.reasonCode, 'approval_invalid_or_expired');
  assert.equal(result.preconditionChecks.length, 2);
});

test('the final target read timeout denies dispatch without retrying the effect', async () => {
  let reads = 0, signal;
  const e = setup({ preconditionTimeoutMs: 10, target: {
    async checkPreconditions(_request, context) { if (++reads === 1) return available(); signal = context.signal; return new Promise(() => {}); },
    async invoke() { assert.fail('unavailable check must not invoke'); }
  } });
  const admitted = await e.actions.authorizeDispatch(request());
  const result = await e.actions.dispatch(admitted.action.actionRef);
  assert.equal(result.status, 'denied'); assert.equal(signal.aborted, true);
  assert.equal(result.preconditionChecks[1].result.reasonCode, 'target_preconditions_unavailable');
  await e.actions.dispatch(result.actionRef); assert.equal(reads, 2);
});

test('Home Assistant rejects another source or a binding changed during the read', async () => {
  for (const mode of ['source', 'site', 'binding']) {
    let config = { siteRef: 'home.synthetic', sourceRef: 'ha.synthetic', baseUrl: 'http://synthetic.invalid' };
    const adapter = { get configuration() { return { ...config }; }, async getState() {
      if (mode === 'binding') config = { ...config, baseUrl: 'http://other.synthetic.invalid' };
      return { siteRef: mode === 'site' ? 'home.other' : 'home.synthetic', sourceRef: mode === 'source' ? 'ha.other' : 'ha.synthetic', externalEntityId: 'light.synthetic', property: 'state', value: 'on', eventTime: '2020-01-01T00:00:00Z' };
    } };
    const e = setup({ target: new HomeAssistantActionTarget({ adapter }) });
    const result = await e.actions.authorizeDispatch(request());
    assert.equal(result.action, null);
    assert.deepEqual(result.decision.rationaleCodes, [mode === 'binding' ? 'target_binding_changed' : 'target_state_scope_mismatch']);
  }
});

test('authenticated Human approval and Gateway HTTP preserve target denial and original-result replay', async t => {
  const state = { entity_id: 'light.synthetic', state: 'unavailable', last_updated: '2020-01-01T00:00:00Z', attributes: {} }, calls = [];
  const adapter = new HomeAssistantAdapter({ store: new StateStore({ state: emptyState() }), config: { siteRef: 'home.one', sourceRef: 'ha.synthetic', baseUrl: 'http://synthetic.invalid', tokenRef: 'secret://synthetic' }, resolveToken: async () => 'synthetic-token', fetchImpl: async (_url, init) => {
    calls.push(init.method ?? 'GET'); return new Response(JSON.stringify(init.method === 'POST' ? [] : state), { status: 200 });
  } });
  const f = await gatewayApprovalFixture({ target: new HomeAssistantActionTarget({ adapter }), liveEffectsEnabled: true, executionEnvironmentRef: 'live' });
  t.after(() => f.close());
  const pending = await f.prepare(); assert.equal(pending.body.status, 'approval_required'); assert.equal(calls.length, 0);
  const approval = pending.body.approval; await f.login();
  const accepted = await f.send(`/api/approvals/${approval.approvalRef}/approve`, { confirmationDigest: approval.confirmationDigest });
  assert.equal(accepted.status, 200); assert.equal(calls.length, 0);
  const denied = await f.prepare({ approvalRef: approval.approvalRef });
  assert.equal(denied.body.outcome, 'denied'); assert.deepEqual(denied.body.rationaleCodes, ['target_state_unavailable']);
  assert.deepEqual(calls, ['GET']);
  state.state = 'on';
  const admitted = await f.prepare({ approvalRef: approval.approvalRef });
  assert.equal(admitted.body.status, 'outcome_unknown'); assert.ok(admitted.body.actionRef);
  const reads = calls.length; state.state = 'unavailable';
  const replay = await f.prepare({ approvalRef: approval.approvalRef });
  assert.equal(replay.body.actionRef, admitted.body.actionRef); assert.equal(replay.body.status, 'outcome_unknown');
  assert.equal(calls.length, reads); assert.equal(calls.filter(method => method === 'POST').length, 1);
  const stored = (await f.store.load()).actions[admitted.body.actionRef];
  assert.equal(stored.preconditionChecks.length, 2); assert.equal(stored.approvalRef, approval.approvalRef);
});
