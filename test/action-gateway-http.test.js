import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';

test('real HTTP action boundary preserves preview, version, duplicate and scoped status semantics', async t => {
  const store = new StateStore({ state: emptyState() });
  let calls = 0;
  const actions = new ActionService({ store, target: { async invoke() { calls++; return { status: 'succeeded', externalEffectOccurred: true }; } } });
  actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
  const token = 'synthetic-action-http-token';
  const binding = createGatewayHttpBinding({ store, actionService: actions, token, siteRefs: ['home.one'] });
  const server = createServer(async (req, res) => binding.handle(req, res, new URL(req.url, 'http://127.0.0.1').pathname));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/gateway/v1`;
  const post = async (path, payload) => {
    const response = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(2000) });
    return { status: response.status, body: await response.json() };
  };
  const identity = { assistantRef: 'assistant.synthetic', audienceRef: 'audience.synthetic' };
  const authority = await post('/authority', { siteRefs: ['home.one'], ...identity });
  assert.equal(authority.status, 201);
  const snapshot = await post('/request', { authorityContextRef: authority.body.authorityContextRef, ...identity, executionEnvironmentRef: 'test', operation: 'capabilities.getSnapshot' });
  assert.equal(snapshot.status, 200);
  const request = { authorityContextRef: authority.body.authorityContextRef, ...identity, worldRef: 'world.personal.v1', executionEnvironmentRef: 'test', snapshotRef: snapshot.body.snapshotRef, siteRef: 'home.one', capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', capabilityOperation: 'light.set_level', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, approvalRequired: false, idempotencyKey: 'synthetic-http-action' };
  const missingSnapshot = await post('/request', { ...request, operation: 'capabilities.invoke', snapshotRef: '00000000-0000-4000-8000-000000000001' });
  assert.equal(missingSnapshot.body.error.code, 'snapshot_unavailable'); assert.equal(calls, 0);
  const preview = await post('/request', { ...request, operation: 'authority.evaluate' });
  assert.equal(preview.body.outcome, 'allowed');
  assert.equal(calls, 0);
  assert.deepEqual((await store.load()).actions, {});
  const trusted = await post('/request', { ...request, operation: 'authority.authorizeDispatch' });
  assert.equal(trusted.body.error.code, 'trusted_dispatch_only');
  const wrongVersion = await post('/request', { ...request, operation: 'capabilities.invoke', capabilityVersion: '2.0.0' });
  assert.equal(wrongVersion.body.outcome, 'denied');
  assert.deepEqual(wrongVersion.body.rationaleCodes, ['capability_version_mismatch']);
  assert.equal(calls, 0);
  const invoked = await post('/request', { ...request, operation: 'capabilities.invoke' });
  assert.equal(invoked.status, 200);
  assert.equal(invoked.body.status, 'completed');
  const duplicate = await post('/request', { ...request, operation: 'capabilities.invoke' });
  assert.equal(duplicate.body.actionRef, invoked.body.actionRef);
  assert.equal(calls, 1);
  const status = { authorityContextRef: request.authorityContextRef, ...identity, executionEnvironmentRef: 'test', actionRef: invoked.body.actionRef, operation: 'capabilities.getInvocation' };
  assert.equal((await post('/request', status)).body.status, 'known');
  assert.equal((await post('/request', { ...status, executionEnvironmentRef: 'replay' })).body.status, 'unknown');
  const other = await post('/authority', { siteRefs: ['home.one'], ...identity, audienceRef: 'audience.other' });
  assert.equal((await post('/request', { ...status, authorityContextRef: other.body.authorityContextRef, audienceRef: 'audience.other' })).body.status, 'unknown');
  const changed = await post('/request', { ...request, operation: 'capabilities.invoke', parameters: { level: 0.8 } });
  assert.equal(changed.body.error.code, 'idempotency_conflict');
  assert.equal(calls, 1);
});

test('authenticated HTTP status reconciles one original attempt without repeating the action', async t => {
  const store = new StateStore({ state: emptyState() }); let invokes = 0, reads = 0;
  const actions = new ActionService({ store, target: { identity: 'synthetic-http-target',
    async invoke() { invokes++; return { status: 'outcome_unknown', externalEffectOccurred: 'unknown', reasonCode: 'synthetic_lost_reply' }; },
    async reconcile() { reads++; return { status: 'succeeded', externalEffectOccurred: true, observed: { level: 0.5 }, reasonCode: 'synthetic_observation' }; } } });
  actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
  const token = 'synthetic-reconciliation-token', binding = createGatewayHttpBinding({ store, actionService: actions, token, siteRefs: ['home.one'] });
  const server = createServer(async (req, res) => binding.handle(req, res, new URL(req.url, 'http://127.0.0.1').pathname));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const post = async (path, payload) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/gateway/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(2000) });
    return { status: response.status, body: await response.json() };
  };
  const identity = { assistantRef: 'assistant.synthetic', audienceRef: 'audience.synthetic' };
  const authority = await post('/authority', { siteRefs: ['home.one'], ...identity });
  const scope = { authorityContextRef: authority.body.authorityContextRef, ...identity, executionEnvironmentRef: 'test' };
  const original = await post('/request', { ...scope, operation: 'capabilities.invoke', capabilityOperation: 'light.set_level', capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', siteRef: 'home.one', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, approvalRequired: false, idempotencyKey: 'synthetic-http-reconciliation' });
  assert.equal(original.body.status, 'outcome_unknown');
  const query = { ...scope, actionRef: original.body.actionRef, operation: 'capabilities.getInvocation' };
  assert.equal((await post('/request', { ...query, executionEnvironmentRef: 'replay' })).body.status, 'unknown'); assert.equal(reads, 0);
  const recovered = await post('/request', query); assert.equal(recovered.status, 200); assert.equal(recovered.body.action.status, 'succeeded');
  assert.equal(recovered.body.action.dispatchResult.status, 'outcome_unknown'); assert.equal(recovered.body.action.reconciliations.length, 1);
  assert.equal((await post('/request', query)).body.action.status, 'succeeded'); assert.equal(invokes, 1); assert.equal(reads, 1);
});
