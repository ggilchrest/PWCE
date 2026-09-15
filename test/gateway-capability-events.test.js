import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { GatewayService } from '../src/gateway/gateway-service.js';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';

function fixture(t, options = {}) {
  let now = Date.now(), calls = 0, source = 0;
  const clock = () => new Date(now), store = new StateStore({ state: emptyState() });
  const actions = new ActionService({ store, clock, target: { identity: 'synthetic-event-target', async invoke() { calls++; return { status: 'succeeded', externalEffectOccurred: true }; } } });
  const sites = { 'agent.one': ['home.one','home.two'], 'agent.two': ['home.other'] };
  for (const [principalRef, siteRefs] of Object.entries(sites)) actions.registerGrant({ principalRef, siteRefs, capabilityRefs: ['home.light.set_level'] });
  const original = actions.snapshot.bind(actions);
  actions.snapshot = () => ({ ...original(), bindingRef: `synthetic-source-${source}` });
  const gateway = new GatewayService({ store, actionService: actions, clock, ...options });
  t.after(() => gateway.close());
  const token = principal => `synthetic-event-token-${principal}`;
  const register = (selected = gateway) => {
    for (const [principalRef, siteRefs] of Object.entries(sites)) selected.registerPrincipal({ principalRef, token: token(principalRef), siteRefs });
  };
  register();
  const context = (principal = 'agent.one', selected = gateway, ttlMs = 300_000) => {
    const identity = { assistantRef: `assistant.${principal}`, endpointRef: `endpoint.${principal}`, participantRefs: [`participant.${principal}`], audienceRef: `audience.${principal}` };
    const authority = selected.issueAuthorityContext({ principalRef: principal, token: token(principal), siteRefs: sites[principal], ttlMs, ...identity });
    return { token: token(principal), authorityContextRef: authority.authorityContextRef, worldRef: 'world.personal.v1', executionEnvironmentRef: 'test', ...identity };
  };
  const first = context(), second = context('agent.two');
  const request = (scope, operation, extra = {}, selected = gateway) => selected.requestAuthenticated({ ...scope, operation, ...extra });
  const open = async (scope = first, siteRef = 'home.one', afterCursor = '0', selected = gateway, limit = 100) => {
    const seen = { replay: null, events: [], closed: [] };
    const { token: bearer, ...binding } = scope;
    const close = await selected.openEventStream({ token: bearer, request: { ...binding, operation: 'events.subscribe', siteRef, afterCursor, limit }, onReplay: value => { seen.replay = value; }, onEvent: value => seen.events.push(value), onClose: reason => seen.closed.push(reason) });
    t.after(close);
    return { ...seen, close };
  };
  return { gateway, actions, store, first, second, context, register, request, open, change: () => { source++; }, restore: () => { source = 0; }, calls: () => calls, advance: ms => { now += ms; }, clock };
}

const changed = events => events.filter(event => event.type === 'capabilities.invalidated' && event.reason === 'capability_source_changed');

test('capability source changes reach every site subscription with only its principal scope', async t => {
  const f = fixture(t);
  await f.request(f.first, 'capabilities.getSnapshot');
  const one = await f.open(), two = await f.open(f.first, 'home.two'), other = await f.open(f.second, 'home.other');
  f.change(); await f.request(f.first, 'capabilities.getSnapshot');
  assert.equal(changed(one.events).length, 1);
  assert.deepEqual(one.events, two.events);
  assert.equal(changed(other.events).length, 1);
  assert.deepEqual(one.events[0].watch, { siteRefs: [], principalRefs: ['agent.one'] });
  assert.deepEqual(other.events[0].watch, { siteRefs: [], principalRefs: ['agent.two'] });
  assert.notEqual(one.events[0].eventId, other.events[0].eventId);
  assert.equal(one.events[0].sourceRevision, other.events[0].sourceRevision);
  assert.match(one.events[0].sourceRevision, /^[0-9a-f]{64}$/);
  assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
});

test('multiple authority contexts share one principal notification and unchanged reads emit nothing', async t => {
  const f = fixture(t), another = f.context();
  await f.request(f.first, 'capabilities.getSnapshot');
  const first = await f.open(), second = await f.open(another);
  f.change(); await f.request(f.first, 'capabilities.getSnapshot');
  await f.request(another, 'capabilities.getSnapshot'); await f.request(f.first, 'capabilities.getSnapshot');
  assert.equal(first.events.length, 1); assert.deepEqual(first.events, second.events);
});

test('scoped replay preserves the live event identity and resumes without repeating it', async t => {
  const f = fixture(t); await f.request(f.first, 'capabilities.getSnapshot');
  const live = await f.open(); f.change(); await f.request(f.first, 'capabilities.getSnapshot'); live.close();
  const replay = await f.open(); assert.deepEqual(changed(replay.replay.events), changed(live.events)); assert.equal(replay.replay.events.length, 1);
  const resumed = await f.open(f.first, 'home.two', replay.replay.nextCursor);
  assert.deepEqual(resumed.replay.events, []); f.change(); await f.request(f.second, 'capabilities.getSnapshot');
  assert.equal(resumed.events.length, 1); assert.ok(Number(resumed.events[0].cursor) > Number(replay.replay.nextCursor));
  assert.deepEqual(resumed.events[0].watch.principalRefs, ['agent.one']);
});

test('expiry or revocation closes affected streams instead of delivering capability change data', async t => {
  for (const cause of ['expiry','principal','grant']) {
    const f = fixture(t); const scope = cause === 'expiry' ? f.context('agent.one', f.gateway, 1000) : f.first;
    await f.request(scope, 'capabilities.getSnapshot'); const stream = await f.open(scope);
    if (cause === 'expiry') f.advance(1001);
    if (cause === 'principal') f.gateway.registerPrincipal({ principalRef: 'agent.one', token: 'synthetic-replacement-token', siteRefs: [] });
    if (cause === 'grant') f.actions.registerGrant({ principalRef: 'agent.one', siteRefs: [], capabilityRefs: [] });
    f.change(); await f.request(f.second, 'capabilities.getSnapshot');
    assert.deepEqual(stream.events, []); assert.deepEqual(stream.closed, [{ expiry: 'authority_context_expired', principal: 'authentication_failed', grant: 'authority_context_invalidated' }[cause]]);
  }
});

test('persisted capability notifications replay after gateway restart without crossing principals', async t => {
  const f = fixture(t); await f.request(f.first, 'capabilities.getSnapshot');
  f.change(); await f.request(f.first, 'capabilities.getSnapshot');
  // An authenticated replay waits for the event persistence queue.
  const before = await f.request(f.first, 'events.subscribe', { siteRef: 'home.one' });
  f.gateway.close();
  const restarted = new GatewayService({ store: f.store, actionService: f.actions, clock: f.clock }); t.after(() => restarted.close());
  f.register(restarted); const scope = f.context('agent.one', restarted);
  const replay = await f.open(scope, 'home.two', '0', restarted);
  assert.equal(replay.replay.events.length, 1); assert.deepEqual(replay.replay.events, before.events);
  assert.deepEqual(replay.replay.events[0].watch.principalRefs, ['agent.one']);
  assert.equal(f.calls(), 0);
});

test('bounded retention signals a gap without partial replay while live delivery continues', async t => {
  const f = fixture(t, { eventRetention: 2 }); await f.request(f.first, 'capabilities.getSnapshot');
  for (let i = 0; i < 3; i++) { f.change(); await f.request(f.first, 'capabilities.getSnapshot'); }
  const stream = await f.open();
  assert.equal(stream.replay.resyncRequired, true); assert.deepEqual(stream.replay.events, []);
  f.change(); await f.request(f.first, 'capabilities.getSnapshot');
  assert.equal(stream.events.length, 1); assert.deepEqual(stream.events[0].watch.principalRefs, ['agent.one']);
});

test('restoring source content emits a new notification without reviving old snapshots', async t => {
  const f = fixture(t), first = await f.request(f.first, 'capabilities.getSnapshot');
  const stream = await f.open(); f.change();
  await assert.rejects(f.request(f.first, 'capabilities.getSnapshot', { snapshotRef: first.snapshotRef }), { code: 'snapshot_stale' });
  f.restore();
  await assert.rejects(f.request(f.first, 'capabilities.getSnapshot', { snapshotRef: first.snapshotRef }), { code: 'snapshot_stale' });
  const fresh = await f.request(f.first, 'capabilities.getSnapshot');
  assert.notEqual(fresh.snapshotRef, first.snapshotRef); assert.equal(stream.events.length, 2);
  assert.notEqual(stream.events[0].eventId, stream.events[1].eventId); assert.equal(f.calls(), 0);
});

test('authenticated HTTP SSE carries the same scoped notification later returned by replay', async t => {
  const f = fixture(t), binding = createGatewayHttpBinding({ store: f.store, actionService: f.actions, gateway: f.gateway, token: f.first.token, principalRef: 'agent.one', siteRefs: ['home.one','home.two'] });
  const { token, ...scope } = f.context();
  const server = createServer((req, res) => { void binding.handle(req, res, new URL(req.url, 'http://localhost').pathname).catch(() => { res.writeHead(500); res.end(); }); });
  const controller = new AbortController(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
  t.after(async () => { controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`, headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = async (operation, extra = {}) => {
    const response = await fetch(`${base}/gateway/v1/request`, { method: 'POST', headers, body: JSON.stringify({ ...scope, operation, ...extra }), signal });
    assert.equal(response.status, 200); return response.json();
  };
  const first = await post('capabilities.getSnapshot');
  const query = new URLSearchParams({ ...scope, participantRefs: JSON.stringify(scope.participantRefs), siteRef: 'home.two' });
  const response = await fetch(`${base}/gateway/v1/events?${query}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '';
  f.change(); const fresh = await post('capabilities.getSnapshot'); assert.notEqual(fresh.snapshotRef, first.snapshotRef);
  while (!text.includes('event: capabilities.invalidated') || !text.slice(text.indexOf('event: capabilities.invalidated')).includes('\n\n')) {
    const chunk = await reader.read(); assert.equal(chunk.done, false); text += decoder.decode(chunk.value, { stream: true }); assert.ok(text.length < 65536);
  }
  const frame = text.split('\n\n').find(value => value.includes('event: capabilities.invalidated'));
  const event = JSON.parse(frame.split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.ok(frame.includes(`id: ${event.cursor}`)); assert.deepEqual(event.watch, { siteRefs: [], principalRefs: ['agent.one'] });
  const replay = await post('events.subscribe', { siteRef: 'home.two' });
  assert.deepEqual(replay.events, [event]); assert.equal(f.calls(), 0);
  await reader.cancel();
});
