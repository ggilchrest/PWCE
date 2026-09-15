import test from 'node:test';
import assert from 'node:assert/strict';
import {StateStore,emptyState} from '../src/runtime/state-store.js';
import {ActionService} from '../src/actions/action-service.js';
import {ApprovalService} from '../src/actions/approval-service.js';
import {GatewayService} from '../src/gateway/gateway-service.js';
const request=(extra={})=>({principalRef:'agent.fixture',capabilityRef:'home.light.set_level',capabilityVersion:'1.0.0',operation:'light.set_level',siteRef:'home.one',targetEntityId:'light.synthetic',parameters:{level:0.5},executionEnvironmentRef:'test',approvalRequired:false,idempotencyKey:'synthetic-action',...extra});
const register=actions=>actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
const target=()=>({calls:0,async invoke(){this.calls++;return {status:'succeeded',externalEffectOccurred:true};}});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(){const store=new StateStore({state:emptyState()}),fake=target(),actions=new ActionService({store,target:fake});register(actions);const gateway=new GatewayService({store,actionService:actions});gateway.registerPrincipal({principalRef:'agent.fixture',token:'synthetic-fixture-token',siteRefs:['home.one']});const authority=gateway.issueAuthorityContext({principalRef:'agent.fixture',token:'synthetic-fixture-token',siteRefs:['home.one']});const input={...request(),operation:'capabilities.invoke',capabilityOperation:'light.set_level',authorityContextRef:authority.authorityContextRef};return {store,fake,actions,gateway,input};}
test('gateway preserves requested capability version instead of admitting another version',async()=>{
 const e=setup();const result=await e.gateway.request({...e.input,capabilityVersion:'2.0.0'});assert.equal(result.outcome,'denied');assert.deepEqual(result.rationaleCodes,['capability_version_mismatch']);assert.equal(e.fake.calls,0);
});
test('gateway rechecks authenticated authority after its asynchronous audit write',async()=>{
 const e=setup();let changed=false;e.store.subscribe(state=>{if(!changed&&state.audit.at(-1)?.type==='gateway.request'){changed=true;e.gateway.registerPrincipal({principalRef:'agent.fixture',token:'rotated-synthetic-token',siteRefs:['home.one']});}});
 await assert.rejects(()=>e.gateway.request(e.input),error=>error.code==='authority_context_invalidated');assert.equal(e.fake.calls,0);
});
test('approval and action idempotency identities include execution environment',async()=>{
 const store=new StateStore({state:emptyState()}),approvals=new ApprovalService({store}),actions=new ActionService({store,target:target(),liveEffectsEnabled:true});register(actions);
 const pending=await approvals.request({request:request(),requestedBy:'agent.fixture'});await approvals.approve({approvalRef:pending.approvalRef,approvedBy:'human.synthetic'});
 assert.equal(await approvals.verify({approvalRef:pending.approvalRef,request:request({executionEnvironmentRef:'live'})}),false);
 await actions.authorizeDispatch(request());await assert.rejects(()=>actions.authorizeDispatch(request({executionEnvironmentRef:'replay'})),error=>error.code==='idempotency_conflict');
});
test('independent action-service instances cannot cross the target boundary twice',async()=>{
 const store=new StateStore({state:emptyState()}),gate=defer(),fake={calls:0,async invoke(){this.calls++;await gate.promise;return {status:'succeeded',externalEffectOccurred:true};}},one=new ActionService({store,target:fake}),two=new ActionService({store,target:fake});register(one);register(two);
 const admitted=await one.authorizeDispatch(request()),first=one.dispatch(admitted.action.actionRef),second=two.dispatch(admitted.action.actionRef);
 try{await new Promise(resolve=>setTimeout(resolve,0));assert.equal(fake.calls,1);}finally{gate.resolve();await Promise.all([first,second]);}
});
test('restart with a recorded dispatch attempt reconciles uncertainty instead of repeating it',async()=>{
 const store=new StateStore({state:emptyState()}),entered=defer(),gate=defer(),first=new ActionService({store,target:{async invoke(){entered.resolve();await gate.promise;return {status:'succeeded',externalEffectOccurred:true};}}});register(first);
 const admitted=await first.authorizeDispatch(request()),pending=first.dispatch(admitted.action.actionRef);await entered.promise;
 try{const restored=new StateStore({state:await store.load()}),fake=target(),restarted=new ActionService({store:restored,target:fake});register(restarted);const result=await restarted.dispatch(admitted.action.actionRef);assert.equal(fake.calls,0);assert.equal(result.status,'outcome_unknown');}finally{gate.resolve();await pending;}
});
test('grant denial returns the same complete action shape as other dispatch outcomes',async()=>{
 const e=setup(),admitted=await e.actions.authorizeDispatch(request());e.actions.registerGrant({principalRef:'agent.fixture',siteRefs:[],capabilityRefs:[]});const result=await e.actions.dispatch(admitted.action.actionRef);assert.equal(result.actionRef,admitted.action.actionRef);assert.equal(result.result.externalEffectOccurred,false);assert.equal(result.status,'denied');
});

test('equivalent omitted and explicit current versions share approval and invocation identity', async () => {
  const store = new StateStore({ state: emptyState() });
  const approvals = new ApprovalService({ store });
  const fake = target();
  const actions = new ActionService({ store, target: fake, approvalService: approvals });
  register(actions);
  const original = request({ capabilityVersion: undefined, approvalRequired: true });
  const pending = await approvals.request({ request: original, requestedBy: 'agent.fixture' });
  await approvals.approve({ approvalRef: pending.approvalRef, approvedBy: 'human.synthetic' });
  const approved = { ...original, approvalRef: pending.approvalRef };
  const first = await actions.authorizeDispatch(approved);
  const duplicate = await actions.authorizeDispatch({ ...approved, capabilityVersion: '1.0.0' });
  assert.equal(duplicate.action.actionRef, first.action.actionRef);
  assert.equal((await actions.dispatch(first.action.actionRef)).status, 'succeeded');
  assert.equal(fake.calls, 1);
});

test('approval expiry while admission persists prevents target invocation', async () => {
  let now = new Date('2026-09-15T12:00:00Z');
  const store = new StateStore({ state: emptyState() });
  const approvals = new ApprovalService({ store, clock: () => now });
  const fake = target();
  const actions = new ActionService({ store, target: fake, approvalService: approvals, clock: () => now });
  register(actions);
  const original = request({ approvalRequired: true });
  const pending = await approvals.request({ request: original, requestedBy: 'agent.fixture', expiresInMs: 1000 });
  await approvals.approve({ approvalRef: pending.approvalRef, approvedBy: 'human.synthetic' });
  const admitted = await actions.authorizeDispatch({ ...original, approvalRef: pending.approvalRef });
  store.subscribe(state => { if (state.audit.at(-1)?.type === 'action.started') now = new Date('2026-09-15T12:00:02Z'); });
  const result = await actions.dispatch(admitted.action.actionRef);
  assert.equal(result.result.reasonCode, 'approval_invalid_or_expired');
  assert.equal(fake.calls, 0);
});

test('invalid numeric inputs and targets never pass preview or admission', async () => {
  const e = setup();
  for (const parameters of [undefined, {}, [], { level: NaN }, { level: Infinity }, { level: -Infinity }, { level: '0.5' }, { level: 0.5, surprise: true }]) {
    assert.deepEqual((await e.actions.authorizeDispatch(request({ parameters }))).decision.rationaleCodes, ['invalid_parameters']);
  }
  for (const targetEntityId of ['', null, [], 'x'.repeat(129)]) {
    assert.deepEqual((await e.actions.authorizeDispatch(request({ targetEntityId }))).decision.rationaleCodes, ['invalid_target']);
  }
  assert.equal(e.fake.calls, 0);
});

test('deadline expiry during gateway audit cannot admit an action', async () => {
  const store = new StateStore({ state: emptyState() });
  let now = new Date('2026-09-15T12:00:00Z');
  const fake = target(), actions = new ActionService({ store, target: fake, clock: () => now });
  register(actions);
  const gateway = new GatewayService({ store, actionService: actions, clock: () => now });
  gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'] });
  const authority = gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'] });
  store.subscribe(state => { if (state.audit.at(-1)?.type === 'gateway.request') now = new Date('2026-09-15T12:00:02Z'); });
  await assert.rejects(() => gateway.request({ ...request(), operation: 'capabilities.invoke', capabilityOperation: 'light.set_level', authorityContextRef: authority.authorityContextRef, deadline: '2026-09-15T12:00:01Z' }), error => error.code === 'deadline_exceeded');
  assert.deepEqual((await store.load()).actions, {});
  assert.equal(fake.calls, 0);
});

test('grant or authority changes during durable start prevent the target crossing', async () => {
  for (const kind of ['grant', 'authority']) {
    const e = setup();
    let current = true;
    const admitted = await e.actions.authorizeDispatch(request());
    e.store.subscribe(state => {
      if (state.audit.at(-1)?.type !== 'action.started') return;
      if (kind === 'grant') e.actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: [], capabilityRefs: [] });
      else current = false;
    });
    const result = await e.actions.dispatch(admitted.action.actionRef, { assertCurrent: () => { if (!current) throw new Error('expired owner'); } });
    assert.equal(result.status, 'denied');
    assert.equal(result.result.externalEffectOccurred, false);
    assert.equal(e.fake.calls, 0);
  }
});

test('an ignored target deadline stays unknown even after a late success and duplicate dispatch', async () => {
  const store = new StateStore({ state: emptyState() });
  const gate = defer();
  let calls = 0, signal;
  const actions = new ActionService({ store, target: { async invoke(_action, options) { calls++; signal = options.signal; return gate.promise; } } });
  register(actions);
  const admitted = await actions.authorizeDispatch(request({ deadline: new Date(Date.now() + 200).toISOString() }));
  try {
    const result = await actions.dispatch(admitted.action.actionRef);
    assert.equal(result.status, 'outcome_unknown');
    assert.equal(result.result.reasonCode, 'target_deadline_exceeded');
    assert.equal(signal.aborted, true);
    gate.resolve({ status: 'succeeded', externalEffectOccurred: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await actions.dispatch(admitted.action.actionRef)).status, 'outcome_unknown');
    assert.equal(calls, 1);
  } finally { gate.resolve({ status: 'succeeded', externalEffectOccurred: true }); }
});

test('gateway status and duplicate admission cannot cross Assistant, audience, World or environment', async () => {
  const e = setup();
  const result = await e.gateway.request(e.input);
  const base = { operation: 'capabilities.getInvocation', authorityContextRef: e.input.authorityContextRef, actionRef: result.actionRef, executionEnvironmentRef: 'test' };
  assert.equal((await e.gateway.request(base)).status, 'known');
  assert.equal((await e.gateway.request({ ...base, executionEnvironmentRef: 'replay' })).status, 'unknown');
  for (const identity of [{ assistantRef: 'assistant.other' }, { audienceRef: 'audience.other' }, { endpointRef: 'endpoint.other' }, { participantRefs: ['participant.other'] }]) {
    const context = e.gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token: 'synthetic-fixture-token', siteRefs: ['home.one'], ...identity });
    const owner = { ...identity, authorityContextRef: context.authorityContextRef };
    assert.equal((await e.gateway.request({ ...base, ...owner })).status, 'unknown');
    await assert.rejects(() => e.gateway.request({ ...e.input, ...owner }), error => error.code === 'idempotency_conflict');
  }
  await e.store.transaction(state => { state.worldRef = 'world.other'; });
  assert.equal((await e.gateway.request(base)).status, 'unknown');
  await assert.rejects(() => e.gateway.request(e.input), error => error.code === 'idempotency_conflict');
  assert.equal(e.fake.calls, 1);
});

test('gateway status rechecks authority after an asynchronous action read', async () => {
  const e = setup(), result = await e.gateway.request(e.input);
  const original = e.actions.getInvocation.bind(e.actions);
  e.actions.getInvocation = async actionRef => {
    const action = await original(actionRef);
    e.gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'rotated-synthetic-token', siteRefs: ['home.one'] });
    return action;
  };
  await assert.rejects(() => e.gateway.request({ operation: 'capabilities.getInvocation', authorityContextRef: e.input.authorityContextRef, executionEnvironmentRef: 'test', actionRef: result.actionRef }), error => error.code === 'authority_context_invalidated');
  assert.equal(e.fake.calls, 1);
});

test('a failed admission write is never exposed in memory or sent to a target', async () => {
  const { mkdtemp, mkdir, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const directory = await mkdtemp(join(tmpdir(), 'pwce-admission-write-failure-'));
  const path = join(directory, 'state.json');
  try {
    const store = new StateStore({ path, state: emptyState() }), fake = target(), actions = new ActionService({ store, target: fake });
    register(actions);
    await mkdir(path); // Atomic rename of a file over this directory must fail.
    await assert.rejects(() => actions.authorizeDispatch(request()));
    assert.deepEqual((await store.load()).actions, {});
    assert.equal((await store.load()).revision, 0);
    assert.equal(fake.calls, 0);
    await rm(path, { recursive: true });
    const admitted = await actions.authorizeDispatch(request());
    assert.equal(admitted.duplicate, false);
    await actions.dispatch(admitted.action.actionRef);
    assert.equal(fake.calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('gateway snapshots parameters before waiting for audit or admission', async () => {
  const e = setup();
  const parameters = { level: 0.5 };
  const pending = e.gateway.request({ ...e.input, parameters });
  parameters.level = 0.9;
  const result = await pending;
  assert.equal((await e.actions.getInvocation(result.actionRef)).parameters.level, 0.5);
});

test('a failed start write prevents effects and preserves the last committed admission', async () => {
  const { mkdtemp, mkdir, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const directory = await mkdtemp(join(tmpdir(), 'pwce-start-write-failure-'));
  const path = join(directory, 'state.json');
  try {
    const store = new StateStore({ path, state: emptyState() }), fake = target(), actions = new ActionService({ store, target: fake });
    register(actions);
    const admitted = await actions.authorizeDispatch(request());
    await rm(path);
    await mkdir(path);
    await assert.rejects(() => actions.dispatch(admitted.action.actionRef));
    assert.equal((await actions.getInvocation(admitted.action.actionRef)).status, 'admitted');
    assert.equal(fake.calls, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a legacy admission without a dispatch deadline cannot cross the target', async () => {
  const e = setup(), admitted = await e.actions.authorizeDispatch(request());
  await e.store.transaction(state => { delete state.actions[admitted.action.actionRef].deadlineAt; });
  const result = await e.actions.dispatch(admitted.action.actionRef);
  assert.equal(result.result.reasonCode, 'dispatch_deadline_exceeded');
  assert.equal(e.fake.calls, 0);
});

test('a late dispatch reply cannot erase a newer reconciliation', async () => {
  const store = new StateStore({ state: emptyState() }), gate = defer(), entered = defer();
  const actions = new ActionService({ store, target: {
    identity: 'synthetic-target',
    async invoke() { entered.resolve(); return gate.promise; },
    async reconcile() { return { status: 'succeeded', externalEffectOccurred: true, reasonCode: 'synthetic_observation' }; }
  } });
  register(actions);
  const admitted = await actions.authorizeDispatch(request());
  const pending = actions.dispatch(admitted.action.actionRef);
  await entered.promise;
  try {
    await actions.reconcile(admitted.action.actionRef);
    gate.resolve({ status: 'outcome_unknown', externalEffectOccurred: 'unknown' });
    const result = await pending;
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.reasonCode, 'synthetic_observation');
    assert.ok(result.result.reconciledAt);
  } finally { gate.resolve({ status: 'outcome_unknown', externalEffectOccurred: 'unknown' }); await pending; }
});
