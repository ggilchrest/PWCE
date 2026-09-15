import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';
import { dispatchBundle } from '../src/gateway/dispatch-bundle.js';
import { gatewayBundle } from '../src/gateway/gateway-bundle.js';
import requestSchema from '../contracts/gateway-dispatch/request.schema.json' with { type: 'json' };

async function fixture(t, { enabled = true, result = { status: 'succeeded', externalEffectOccurred: true } } = {}) {
  const token = 'synthetic-agent-http-dispatch-token', dispatcherToken = 'synthetic-host-only-dispatcher-secret';
  const store = new StateStore({ state: emptyState() }); let calls = 0;
  const actions = new ActionService({ store, target: { identity: 'synthetic.split-http-target', async invoke() { calls++; return result; } } });
  actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
  const binding = createGatewayHttpBinding({ store, token, ...(enabled ? { dispatcherToken } : {}), actionService: actions });
  const server = createServer(async (req, res) => { await binding.handle(req, res, new URL(req.url, 'http://127.0.0.1').pathname); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); binding.gateway.close(); });
  const send = async (path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/gateway/v1${path}`, { method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const identity = { assistantRef: 'assistant.synthetic', endpointRef: 'endpoint.synthetic', participantRefs: ['participant.synthetic'], audienceRef: 'audience.synthetic' };
  const authority = await send('/authority', { ...identity, siteRefs: ['home.one'] });
  const scope = { ...identity, authorityContextRef: authority.body.authorityContextRef, worldRef: 'world.personal.v1', executionEnvironmentRef: 'test' };
  const snapshot = await send('/request', { ...scope, operation: 'capabilities.getSnapshot' });
  const request = { ...scope, dispatchProfileId: dispatchBundle.dispatchProfileId, dispatchProfileVersion: dispatchBundle.dispatchProfileVersion,
    profileId: 'pwce-agent-gateway.v1', profileVersion: '1.0.0', operation: 'authority.authorizeDispatch', requestId: 'synthetic-request', correlationId: 'synthetic-correlation', deadline: new Date(Date.now() + 30_000).toISOString(),
    snapshotRef: snapshot.body.snapshotRef, capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', capabilityOperation: 'light.set_level', siteRef: 'home.one', targetEntityId: 'light.synthetic', parameters: { level: 0.5 }, idempotencyKey: 'synthetic-http-split', approvalRequired: false, approvalRef: null };
  const headers = { 'x-pwce-dispatcher-token': dispatcherToken, 'x-pwce-dispatch-contract': dispatchBundle.bundleDigest };
  return { send, request, headers, store, actions, calls: () => calls, token, dispatcherToken };
}

test('dispatch bundle pins its public schema bytes and unchanged core dependency', async () => {
  const manifest = JSON.parse(await readFile('contracts/gateway-dispatch/bundle-manifest.json', 'utf8'));
  assert.deepEqual(manifest, dispatchBundle);
  const aggregate = createHash('sha256');
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(artifact.path); aggregate.update(artifact.path).update('\0').update(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  }
  assert.equal(aggregate.digest('hex'), manifest.bundleDigest);
  assert.deepEqual(manifest.requiredGatewayBundle, { bundleId: gatewayBundle.bundleId, bundleVersion: gatewayBundle.bundleVersion, bundleDigest: gatewayBundle.bundleDigest });
  assert.throws(() => { dispatchBundle.requiredGatewayBundle.bundleDigest = 'changed'; });
});

test('real HTTP authenticates both phases and sends exactly one command', async t => {
  const f = await fixture(t);
  const bundle = await f.send('/dispatch/bundle', undefined, f.headers);
  assert.equal(bundle.status, 200); assert.deepEqual(bundle.body, dispatchBundle);
  assert.equal(bundle.headers.get('cache-control'), 'no-store');
  const first = await f.send('/dispatch', f.request, f.headers);
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.status, 'admitted'); assert.equal(f.calls(), 0);
  assert.equal(first.body.requestId, f.request.requestId); assert.equal(first.body.dispatchProfileVersion, '1.0.0');
  assert.deepEqual(first.body.admission, (await f.store.load()).actions[first.body.actionRef]);
  const duplicate = await f.send('/dispatch', f.request, f.headers);
  assert.equal(duplicate.body.duplicate, true); assert.equal(f.calls(), 0);
  const command = { ...f.request, operation: 'capabilities.invoke', actionRef: first.body.actionRef };
  const results = await Promise.all(Array.from({ length: 4 }, () => f.send('/dispatch', command, f.headers)));
  assert.ok(results.every(r => r.status === 200 && r.body.status === 'completed')); assert.equal(f.calls(), 1);
  assert.equal((await f.send('/dispatch', command, f.headers)).body.status, 'completed'); assert.equal(f.calls(), 1);
  const state = JSON.stringify(await f.store.load()); assert.ok(!state.includes(f.token)); assert.ok(!state.includes(f.dispatcherToken));
});

test('Agent credential, dispatcher credential, body flags and browser Origin cannot bypass the boundary', async t => {
  const f = await fixture(t);
  for (const headers of [{}, { ...f.headers, authorization: 'Bearer wrong' }, { ...f.headers, 'x-pwce-dispatcher-token': 'wrong' }]) {
    assert.equal((await f.send('/dispatch', f.request, headers)).status, 401);
    assert.equal((await f.send('/dispatch/bundle', undefined, headers)).status, 401);
  }
  assert.equal((await f.send('/dispatch', f.request, { ...f.headers, origin: 'http://localhost' })).status, 403);
  const ordinary = await f.send('/request', { ...f.request, trusted: true, trustedDispatch: true }, f.headers);
  assert.equal(ordinary.body.error.code, 'trusted_dispatch_only');
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('disabled trusted transport leaves ordinary Gateway reads available', async t => {
  const f = await fixture(t, { enabled: false });
  assert.equal((await f.send('/dispatch', f.request, f.headers)).body.error.code, 'trusted_dispatch_not_configured');
  assert.equal((await f.send('/dispatch/bundle', undefined, f.headers)).status, 503);
  assert.equal((await f.send('/profile')).status, 200); assert.equal(f.calls(), 0);
});

test('wrong digest, version, method and malformed body never admit an action', async t => {
  const f = await fixture(t);
  assert.equal((await f.send('/dispatch', f.request, { ...f.headers, 'x-pwce-dispatch-contract': '0'.repeat(64) })).status, 409);
  assert.equal((await f.send('/dispatch', { ...f.request, dispatchProfileVersion: '2.0.0' }, f.headers)).status, 400);
  assert.equal((await f.send('/dispatch', undefined, f.headers)).status, 405);
  assert.equal((await f.send('/dispatch/bundle', {}, f.headers)).status, 405);
  assert.equal((await f.send('/dispatch', '[', f.headers)).status, 400);
  assert.equal((await f.send('/dispatch', f.request, { ...f.headers, 'content-type': 'text/plain' })).status, 400);
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('every required request field is enforced and body credentials or unknown fields are rejected', async t => {
  const f = await fixture(t);
  for (const field of requestSchema.required) {
    const request = { ...f.request }; delete request[field];
    const response = await f.send('/dispatch', request, f.headers);
    assert.equal(response.status, 400, field);
  }
  for (const extra of [{ token: f.token }, { dispatcherToken: f.dispatcherToken }, { trusted: true }, { actionRef: '00000000-0000-4000-8000-000000000001' }]) {
    const response = await f.send('/dispatch', { ...f.request, ...extra }, f.headers);
    assert.equal(response.status, 400); assert.ok(!JSON.stringify(response.body).includes(f.dispatcherToken));
  }
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('published bounds and unsupported operations are enforced before admission', async t => {
  const f = await fixture(t);
  for (const overrides of [
    { requestId: 'x'.repeat(129) }, { participantRefs: ['same','same'] }, { participantRefs: Array(33).fill('x') },
    { participantRefs: [null] }, { parameters: [] }, { parameters: Object.fromEntries(Array.from({length:33}, (_,i) => [String(i), i])) },
    { approvalRequired: 'false' }, { snapshotRef: 'unbound' }, { operation: 'authority.evaluate' }, { operation: 'capabilities.invoke' },
    { deadline: 'tomorrow' }, { deadline: '2026-09-15' }, { worldRef: null }, { approvalRef: 3 }
  ]) assert.equal((await f.send('/dispatch', { ...f.request, ...overrides }, f.headers)).status, 400, JSON.stringify(overrides));
  assert.deepEqual((await f.store.load()).actions, {}); assert.equal(f.calls(), 0);
});

test('changed authority between HTTP phases prevents target I/O', async t => {
  const f = await fixture(t), admission = await f.send('/dispatch', f.request, f.headers);
  f.actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: [], capabilityRefs: [] });
  const response = await f.send('/dispatch', { ...f.request, operation: 'capabilities.invoke', actionRef: admission.body.actionRef }, f.headers);
  assert.equal(response.status, 401); assert.equal(response.body.error.code, 'authority_context_invalidated'); assert.equal(f.calls(), 0);
});

test('lost target reply is retained through HTTP retries without another command', async t => {
  const f = await fixture(t, { result: { status: 'outcome_unknown', externalEffectOccurred: 'unknown' } });
  const first = await f.send('/dispatch', f.request, f.headers), command = { ...f.request, operation: 'capabilities.invoke', actionRef: first.body.actionRef };
  assert.equal((await f.send('/dispatch', command, f.headers)).body.status, 'outcome_unknown');
  assert.equal((await f.send('/dispatch', command, f.headers)).body.status, 'outcome_unknown');
  assert.equal(f.calls(), 1);
});

test('startup rejects reused, short, oversized and header-unsafe dispatcher credentials', () => {
  const store = new StateStore({ state: emptyState() }), token = 'synthetic-agent-token-at-least-32-long';
  for (const dispatcherToken of [token, 'short', 'x'.repeat(513), 'x'.repeat(32)+'\n', 42]) assert.throws(() => createGatewayHttpBinding({ store, token, dispatcherToken }), /distinct host secret/);
  assert.throws(() => createGatewayHttpBinding({ store, dispatcherToken: 'x'.repeat(32) }), /distinct host secret/);
});
