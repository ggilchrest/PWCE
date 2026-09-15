import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/runtime/state-store.js';
import { registerSite, registerSource } from '../src/domain/identity.js';
import { ingestObservation } from '../src/domain/observation-service.js';
import { GatewayService } from '../src/gateway/gateway-service.js';
import { BasicAgent } from '../src/agent/basic-agent.js';
import { createServer } from 'node:http';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';

const origin = Date.parse('2026-09-15T00:00:00Z');
const at = seconds => new Date(origin + seconds * 1000).toISOString();
async function fixture(t) {
  const store = new StateStore({ state: { schemaVersion: 1, worldRef: 'world.fixture', revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
  await store.transaction(state => {
    for (const siteRef of ['home.one', 'home.two']) registerSite(state, { siteRef });
    registerSource(state, { siteRef: 'home.one', sourceRef: 'source.one' });
    registerSource(state, { siteRef: 'home.one', sourceRef: 'source.other' });
    registerSource(state, { siteRef: 'home.two', sourceRef: 'source.two' });
  });
  const gateway = new GatewayService({ store, clock: () => new Date(at(180)) });
  t.after(() => gateway.close());
  gateway.registerPrincipal({ principalRef: 'agent.fixture', token: 'synthetic-context-token', siteRefs: ['home.one', 'home.two'] });
  const authority = gateway.issueAuthorityContext({ principalRef: 'agent.fixture', token: 'synthetic-context-token', siteRefs: ['home.one', 'home.two'] });
  const observe = (value, seconds, extras = {}) => ingestObservation(store, { siteRef: 'home.one', sourceRef: 'source.one', externalEntityId: 'sensor.sample', property: 'sample', value, eventTime: at(seconds), freshnessMs: 1000, ...extras }, { now: () => new Date(at(180)) });
  const query = (mode, extras = {}) => gateway.request({ operation: 'context.query', authorityContextRef: authority.authorityContextRef, siteRef: 'home.one', externalEntityId: 'sensor.sample', property: 'sample', mode, ...extras });
  return { store, gateway, authority, observe, query };
}

test('prepared inputs preserve per-item contradiction, age, evidence and site qualifiers', async t => {
  const { gateway, authority, observe } = await fixture(t);
  const first = await observe(1, 0);
  const other = await observe(2, 0, { sourceRef: 'source.other' });
  await observe(3, 0, { externalEntityId: 'sensor.stale' });
  await observe(4, 0, { externalEntityId: 'sensor.unbounded', freshnessMs: null });
  await observe(999, 0, { siteRef: 'home.two', sourceRef: 'source.two' });
  const result = await gateway.request({ operation: 'context.getPreparedInputs', authorityContextRef: authority.authorityContextRef, siteRef: 'home.one' });
  const conflict = result.inputs.find(item => item.entityRef === 'home.one::sensor.sample');
  assert.equal(conflict.knowledgeState, 'conflicted');
  assert.equal(conflict.freshnessState, 'stale');
  assert.equal(conflict.basis, 'observed');
  assert.equal(conflict.recordedAt, at(180));
  assert.equal(conflict.eventTime, at(0));
  assert.deepEqual(conflict.evidenceRefs.sort(), [first.observation.recordId, other.observation.recordId].sort());
  assert.equal(conflict.contradictions.length, 2);
  assert.equal(result.inputs.find(item => item.entityRef === 'home.one::sensor.stale').knowledgeState, 'stale');
  assert.ok(result.inputs.every(item => item.siteRef === 'home.one'));
  assert.equal(result.inputs.find(item => item.entityRef === 'home.one::sensor.unbounded').freshnessState, 'unknown');
  assert.equal(result.sourceRevision, result.revision);
  assert.equal(result.evaluatedAt, at(180));
  assert.match(result.invalidationCursor, /^\d+$/);
});

test('caller age policy keeps conflict identity and withholds all stale candidate values when requested', async t => {
  const { observe, query } = await fixture(t);
  await observe(1, 0); await observe(2, 0, { sourceRef: 'source.other' });
  for (const mode of ['current', 'explain']) {
    for (const multi of [false, ...(mode === 'current' ? [true] : [])]) {
      const input = { maxAgeMs: 1, ...(multi ? { siteRef: undefined, siteRefs: ['home.one', 'home.two'] } : {}) };
      const result = await query(mode, input);
      const item = multi ? result.items[0] : result;
      assert.equal(item.knowledgeState, 'conflicted');
      assert.equal(item.status, 'conflicted');
      assert.equal(item.freshnessState, 'stale');
      assert.equal(item.freshnessAccepted, false);
      assert.equal(Object.hasOwn(item, 'value'), false);
      assert.ok(item.contradictions.every(candidate => !Object.hasOwn(candidate, 'value')));
      assert.equal(item.evidenceRefs.length, 2);
      const allowed = await query(mode, { ...input, allowStale: true });
      const allowedItem = multi ? allowed.items[0] : allowed;
      assert.equal(allowedItem.knowledgeState, 'conflicted');
      assert.equal(allowedItem.contradictions.length, 2);
      assert.ok(allowedItem.contradictions.every(candidate => Object.hasOwn(candidate, 'value')));
    }
  }
});

test('as-of selection uses the latest eligible observation beyond the history page limit', async t => {
  const { observe, query } = await fixture(t);
  for (let i = 0; i < 105; i++) await observe(i, i);
  const result = await query('asOf', { asOf: at(103), limit: 1 });
  assert.equal(result.selected.value, 103);
  assert.equal(result.selected.eventTime, at(103));
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].value, 0);
  assert.equal(result.hasMore, true);
  const continued = await query('asOf', { asOf: at(103), limit: 1, cursor: result.nextCursor });
  assert.equal(continued.selected.value, 103);
  assert.equal(continued.observations[0].value, 1);
  assert.equal(continued.sourceRevision, result.sourceRevision);
  const empty = await query('asOf', { asOf: at(-1), limit: 1 });
  assert.equal(empty.status, 'unknown');
  assert.equal(Object.hasOwn(empty, 'selected'), false);
});

test('as-of disagreement remains conflicted without an arbitrary selected fact', async t => {
  const { observe, query } = await fixture(t);
  const first = await observe(1, 10);
  const second = await observe(2, 10, { sourceRef: 'source.other' });
  await observe(3, 11);
  const result = await query('asOf', { asOf: at(10), limit: 1 });
  assert.equal(result.status, 'conflicted');
  assert.equal(result.knowledgeState, 'conflicted');
  assert.equal(result.basis, 'observed');
  assert.equal(Object.hasOwn(result, 'selected'), false);
  assert.equal(result.contradictions.length, 2);
  assert.deepEqual(result.evidenceRefs.sort(), [first.observation.recordId, second.observation.recordId].sort());
  assert.equal((await query('asOf', { asOf: at(11) })).selected.value, 3);
});

test('query source revisions remain stable across read-only audits and retain history cursor identity', async t => {
  const { observe, query } = await fixture(t);
  await observe(1, 0); await observe(2, 1);
  for (const mode of ['history', 'asOf', 'explain', 'search']) {
    const input = { limit: 1, ...(mode === 'asOf' ? { asOf: at(1) } : {}), ...(mode === 'search' ? { text: 'sample' } : {}) };
    const first = await query(mode, input), second = await query(mode, input);
    assert.equal(first.sourceRevision, second.sourceRevision, mode);
    if (first.nextCursor) assert.equal(JSON.parse(Buffer.from(first.nextCursor, 'base64url')).sourceRevision, first.sourceRevision);
  }
});

test('Basic Agent historical answers expose real observation references', async t => {
  const { gateway, observe } = await fixture(t);
  const first = await observe(1, 0); const second = await observe(2, 1);
  const agent = new BasicAgent({ gateway, siteRefs: ['home.one'], entityId: 'sensor.sample' });
  const response = await agent.answer({ question: 'Show history', property: 'sample' });
  assert.deepEqual(response.evidenceRefs, [first.observation.recordId, second.observation.recordId]);
});

test('historical freshness uses the requested boundary, not current wall time or an unqualified selected value', async t => {
  const { observe, query } = await fixture(t);
  await observe(7, 0);
  const then = await query('asOf', { asOf: at(1) });
  assert.equal(then.knowledgeState, 'current');
  assert.equal(then.freshnessState, 'current');
  assert.equal(then.ageMs, 1000);
  const later = await query('asOf', { asOf: at(2) });
  assert.equal(later.knowledgeState, 'stale');
  assert.equal(later.freshnessState, 'stale');
  assert.equal(later.selected.value, 7);
  assert.equal(later.ageMs, 2000);
  assert.ok(later.limitations.length);
});

test('authenticated HTTP preserves qualified and withheld fields without granting evidence access across sites', { timeout: 10000 }, async t => {
  const { store, gateway, observe } = await fixture(t);
  await observe(false, 0);
  await observe(true, 0, { sourceRef: 'source.other' });
  const foreign = await observe(999, 0, { siteRef: 'home.two', sourceRef: 'source.two' });
  const token = 'synthetic-http-context-token';
  const binding = createGatewayHttpBinding({ store, gateway, token, principalRef: 'agent.http', siteRefs: ['home.one'] });
  const server = createServer(async (request, response) => { await binding.handle(request, response, new URL(request.url, 'http://127.0.0.1').pathname); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/gateway/v1`;
  const post = async (path, payload) => {
    const response = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  };
  const authority = await post('/authority', { siteRefs: ['home.one'] });
  assert.equal(authority.status, 201);
  const scope = { authorityContextRef: authority.body.authorityContextRef, siteRef: 'home.one', worldRef: 'world.fixture', executionEnvironmentRef: 'replay', requestId: 'request.fixture', correlationId: 'correlation.fixture' };
  const prepared = await post('/request', { ...scope, operation: 'context.getPreparedInputs' });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.body.inputs[0].knowledgeState, 'conflicted');
  assert.deepEqual(prepared.body.inputs[0].contradictions.map(item => item.value), [false, true]);
  for (const field of ['worldRef', 'executionEnvironmentRef', 'requestId', 'correlationId']) assert.equal(prepared.body[field], scope[field]);
  const current = await post('/request', { ...scope, operation: 'context.query', mode: 'current', externalEntityId: 'sensor.sample', property: 'sample', maxAgeMs: 1 });
  assert.equal(current.status, 200);
  assert.equal(current.body.knowledgeState, 'conflicted');
  assert.equal(current.body.freshnessState, 'stale');
  assert.equal(Object.hasOwn(current.body, 'value'), false);
  assert.ok(current.body.contradictions.every(item => !Object.hasOwn(item, 'value')));
  for (const reference of current.body.evidenceRefs) {
    const evidence = await post('/request', { ...scope, operation: 'evidence.get', evidenceRef: reference });
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.evidence.recordId, reference);
  }
  const denied = await post('/request', { ...scope, operation: 'evidence.get', evidenceRef: foreign.observation.recordId });
  assert.notEqual(denied.status, 200);
  assert.equal(denied.body.error.code, 'scope_denied');
});
