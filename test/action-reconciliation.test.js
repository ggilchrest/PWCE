import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { GatewayService } from '../src/gateway/gateway-service.js';
const unknown = () => ({ status: 'outcome_unknown', externalEffectOccurred: 'unknown', reasonCode: 'synthetic_lost_reply' });
const success = () => ({ status: 'succeeded', externalEffectOccurred: true, observed: { level: 0.5 }, reasonCode: 'synthetic_confirmation' });
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const request = () => ({ principalRef: 'agent.fixture', capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', operation: 'light.set_level', siteRef: 'home.one', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, executionEnvironmentRef: 'test', approvalRequired: false, idempotencyKey: 'synthetic-recovery' });
const register = actions => actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
function setup(reconcile = async () => success(), options = {}) {
  const store = options.store ?? new StateStore({ state: emptyState() });
  const target = { identity: 'synthetic-target-installation', invokes: 0, reads: 0,
    async invoke() { this.invokes++; return unknown(); }, async reconcile(...args) { this.reads++; return reconcile(...args); } };
  const actions = new ActionService({ store, target, reconciliationTimeoutMs: 100, ...options }); register(actions);
  return { store, target, actions };
}
async function attempted(f) { const admitted = await f.actions.authorizeDispatch(request()); await f.actions.dispatch(admitted.action.actionRef); return admitted.action.actionRef; }

test('reconciliation never contacts the target for an action that has not been dispatched', async () => {
  const f = setup(), admitted = await f.actions.authorizeDispatch(request());
  const result = await f.actions.reconcile(admitted.action.actionRef);
  assert.equal(result.status, 'admitted'); assert.equal(f.target.reads, 0); assert.equal(f.target.invokes, 0);
});

test('malformed reconciliation does not become success or corrupt the stored action', async () => {
  const f = setup(async () => null), actionRef = await attempted(f);
  const result = await f.actions.reconcile(actionRef);
  assert.equal(result.status, 'outcome_unknown'); assert.equal(result.result.externalEffectOccurred, 'unknown'); assert.equal(f.target.invokes, 1);
});

test('late uncertain reconciliation cannot overwrite another service owner confirmation', async () => {
  const entered = defer(), gate = defer(), f = setup(async () => { entered.resolve(); return gate.promise; });
  const actionRef = await attempted(f), pending = f.actions.reconcile(actionRef); await entered.promise;
  const other = new ActionService({ store: f.store, target: { identity: f.target.identity, reconcile: async () => success() } });
  await other.reconcile(actionRef); gate.resolve(unknown());
  const result = await pending; assert.equal(result.status, 'succeeded'); assert.equal(result.result.reasonCode, 'synthetic_confirmation'); assert.equal(f.target.invokes, 1);
});

test('reconciliation preserves the original dispatch reply and append-only evidence', async () => {
  const f = setup(), actionRef = await attempted(f), original = await f.actions.getInvocation(actionRef);
  const result = await f.actions.reconcile(actionRef);
  assert.deepEqual(result.dispatchResult, original.result); assert.equal(result.reconciliations.length, 1);
  const { sha256, ...evidence } = result.reconciliations[0];
  assert.equal(sha256, createHash('sha256').update(JSON.stringify(evidence)).digest('hex'));
  assert.equal(evidence.actionRef, actionRef); assert.equal(evidence.attemptRef, original.attemptRef); assert.equal(evidence.targetIdentity, f.target.identity);
  const restored = new ActionService({ store: new StateStore({ state: await f.store.load() }), target: { reconcile() { throw new Error('confirmed status must not reread'); } } });
  assert.deepEqual(await restored.reconcile(actionRef), result);
});

test('another target installation cannot reconcile the original action', async () => {
  const f = setup(), actionRef = await attempted(f); let reads = 0;
  const replacement = new ActionService({ store: f.store, target: { identity: 'different-target', reconcile: async () => { reads++; return success(); } } });
  const result = await replacement.reconcile(actionRef);
  assert.equal(result.status, 'outcome_unknown'); assert.equal(reads, 0); assert.equal(f.target.invokes, 1);
});

test('changed attempt identity during target read cannot receive its late outcome', async () => {
  const entered = defer(), gate = defer(), f = setup(async () => { entered.resolve(); return gate.promise; });
  const actionRef = await attempted(f), pending = f.actions.reconcile(actionRef); await entered.promise;
  await f.store.transaction(state => { state.actions[actionRef].attemptRef = 'different-attempt'; }); gate.resolve(success());
  await assert.rejects(pending, error => error.code === 'reconciliation_binding_changed');
  assert.equal((await f.actions.getInvocation(actionRef)).status, 'outcome_unknown');
});

test('target read timeout returns uncertainty and aborts the target without another invocation', async () => {
  let signal;
  const f = setup(async (_action, context) => { signal = context.signal; return new Promise(() => {}); }, { reconciliationTimeoutMs: 20 });
  const actionRef = await attempted(f), start = performance.now();
  const result = await f.actions.reconcile(actionRef);
  assert.ok(performance.now() - start < 500); assert.equal(signal.aborted, true);
  assert.equal(result.result.reasonCode, 'target_reconciliation_deadline_exceeded'); assert.equal(f.target.invokes, 1);
});

test('expired reconciliation request cannot contact the original target', async () => {
  const f = setup(), actionRef = await attempted(f);
  await assert.rejects(() => f.actions.reconcile(actionRef, { deadline: new Date(Date.now() - 1).toISOString() }), error => error.code === 'reconciliation_deadline_exceeded');
  assert.equal(f.target.reads, 0);
});

test('cancelled or revoked reconciliation withholds late output and writes no evidence', async () => {
  for (const cancel of [false, true]) {
    const entered = defer(), gate = defer(), f = setup(async () => { entered.resolve(); return gate.promise; }), actionRef = await attempted(f);
    const controller = new AbortController(); let allowed = true;
    const pending = f.actions.reconcile(actionRef, { signal: controller.signal, assertCurrent() { if (!allowed) throw new Error('scope withdrawn'); } });
    await entered.promise;
    if (cancel) controller.abort(); else allowed = false;
    gate.resolve(success()); await assert.rejects(pending);
    const action = await f.actions.getInvocation(actionRef); assert.equal(action.status, 'outcome_unknown'); assert.equal(action.reconciliations, undefined);
  }
});

test('bounded uncertain history leaves room for final confirmation without deleting observations', async () => {
  let number = 0; const f = setup(async () => ({ ...unknown(), reasonCode: `synthetic_${number++}` })), actionRef = await attempted(f);
  for (let i = 0; i < 16; i++) await f.actions.reconcile(actionRef);
  await assert.rejects(() => f.actions.reconcile(actionRef), error => error.code === 'reconciliation_capacity');
  f.target.reconcile = async () => success(); const confirmed = await f.actions.reconcile(actionRef);
  assert.equal(confirmed.status, 'succeeded'); assert.equal(confirmed.reconciliations.length, 17);
  assert.equal(confirmed.dispatchResult.status, 'outcome_unknown'); assert.equal(f.target.invokes, 1);
});

test('malformed or lossy feedback cannot forge success or host reconciliation metadata', async () => {
  const cycle = {}; cycle.self = cycle;
  const sparse = Array(1); sparse.extra = 1;
  for (const value of [{ ...success(), externalEffectOccurred: false }, { ...success(), reconciledAt: 'forged' }, { ...success(), observed: { level: NaN } }, { ...success(), observed: cycle }, { ...success(), observed: sparse }, { ...unknown(), externalEffectOccurred: false }, { ...success(), observed: 'x'.repeat(16385) }]) {
    const f = setup(async () => value), actionRef = await attempted(f), result = await f.actions.reconcile(actionRef);
    assert.equal(result.status, 'outcome_unknown'); assert.equal(result.result.reasonCode, 'target_invalid_result');
  }
});

test('failed evidence persistence leaves the original outcome available for a later read', async () => {
  const f = setup(), actionRef = await attempted(f), transact = f.store.transaction.bind(f.store);
  f.store.transaction = async () => { throw new Error('synthetic persistence failure'); };
  await assert.rejects(() => f.actions.reconcile(actionRef), /synthetic persistence failure/);
  assert.equal((await f.actions.getInvocation(actionRef)).status, 'outcome_unknown');
  f.store.transaction = transact; assert.equal((await f.actions.reconcile(actionRef)).status, 'succeeded'); assert.equal(f.target.invokes, 1);
});

test('an uncertain observation during dispatch does not suppress a later confirmed dispatch reply', async () => {
  const gate = defer(), entered = defer(), f = setup(async () => unknown());
  f.target.invoke = async () => { f.target.invokes++; entered.resolve(); return gate.promise; };
  const admitted = await f.actions.authorizeDispatch(request()), actionRef = admitted.action.actionRef;
  const pending = f.actions.dispatch(actionRef); await entered.promise;
  await f.actions.reconcile(actionRef); gate.resolve(success());
  const result = await pending; assert.equal(result.status, 'succeeded'); assert.equal(result.dispatchResult.status, 'succeeded');
  assert.equal(result.reconciliations[0].reportedResult.status, 'outcome_unknown');
});

test('gateway status confirms the original effect after checking current full scope and never invokes again', async () => {
  const f = setup(), gateway = new GatewayService({ store: f.store, actionService: f.actions });
  gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'] });
  const identity = { assistantRef: 'assistant.synthetic', endpointRef: 'endpoint.synthetic', participantRefs: ['human.synthetic'], audienceRef: 'audience.synthetic' };
  const auth = gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'], ...identity });
  const input = { ...request(), ...identity, authorityContextRef: auth.authorityContextRef, capabilityOperation: 'light.set_level' };
  const invoked = await gateway.request({ ...input, operation: 'capabilities.invoke' }); assert.equal(invoked.status, 'outcome_unknown');
  const statusRequest = { ...identity, authorityContextRef: auth.authorityContextRef, executionEnvironmentRef: 'test', actionRef: invoked.actionRef, operation: 'capabilities.getInvocation' };
  await assert.rejects(() => gateway.request({ ...statusRequest, assistantRef: 'other' })); assert.equal(f.target.reads, 0);
  const result = await gateway.request(statusRequest); assert.equal(result.action.status, 'succeeded'); assert.equal(result.action.reconciliations.length, 1); assert.equal(f.target.invokes, 1);
  assert.equal((await gateway.request(statusRequest)).action.status, 'succeeded'); assert.equal(f.target.reads, 1);
});

test('gateway authority withdrawal during reconciliation prevents late status release', async () => {
  const f = setup(), gateway = new GatewayService({ store: f.store, actionService: f.actions });
  gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'] });
  const auth = gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'] });
  const invoked = await gateway.request({ ...request(), operation: 'capabilities.invoke', capabilityOperation: 'light.set_level', authorityContextRef: auth.authorityContextRef });
  f.target.reconcile = async () => { gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'rotated-synthetic-token', siteRefs: ['home.one'] }); return success(); };
  await assert.rejects(() => gateway.request({ operation: 'capabilities.getInvocation', authorityContextRef: auth.authorityContextRef, executionEnvironmentRef: 'test', actionRef: invoked.actionRef }), error => error.code === 'authority_context_invalidated');
  assert.equal((await f.actions.getInvocation(invoked.actionRef)).status, 'outcome_unknown');
});

test('durable recovery survives reopening the state file with the original target binding', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'pwce-reconciliation-')), path = join(directory, 'state.json');
  try {
    const f = setup(undefined, { store: new StateStore({ path }) }), actionRef = await attempted(f);
    const restored = new ActionService({ store: new StateStore({ path }), target: f.target });
    const result = await restored.reconcile(actionRef); assert.equal(result.status, 'succeeded'); assert.equal(f.target.invokes, 1);
    const saved = await new StateStore({ path }).load(); assert.deepEqual(saved.actions[actionRef], result);
    assert.equal(saved.actions[actionRef].dispatchResult.reasonCode, 'synthetic_lost_reply');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('tampered confirmed reconciliation evidence is withheld on status reads and dispatch retries', async () => {
  const f = setup(), actionRef = await attempted(f); await f.actions.reconcile(actionRef);
  await f.store.transaction(state => { state.actions[actionRef].reconciliations[0].reportedResult.observed.level = 0.9; });
  for (const operation of [() => f.actions.getInvocation(actionRef), () => f.actions.reconcile(actionRef), () => f.actions.dispatch(actionRef)]) {
    await assert.rejects(operation, error => error.code === 'reconciliation_evidence_corrupt');
  }
  assert.equal(f.target.invokes, 1);
});
