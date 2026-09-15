import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/runtime/state-store.js";
import { registerSite, registerSource } from "../src/domain/identity.js";
import { ingestObservation } from "../src/domain/observation-service.js";
import { GatewayService } from "../src/gateway/gateway-service.js";
import { ActionService } from "../src/actions/action-service.js";
import { FixtureActionTarget } from "../src/actions/fixture-target.js";

const token = "synthetic-stream-token";
async function fixture(t, { retention = 500, ttlMs = 300_000 } = {}) {
  let now = Date.now();
  const store = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
  await store.transaction(state => {
    for (const siteRef of ["home.one", "home.two"]) { registerSite(state, { siteRef }); registerSource(state, { siteRef, sourceRef: `source.${siteRef}` }); }
  });
  const actions = new ActionService({ store, target: new FixtureActionTarget() });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: [] });
  const gateway = new GatewayService({ store, actionService: actions, clock: () => new Date(now), eventRetention: retention });
  t.after(() => gateway.close());
  gateway.registerPrincipal({ principalRef: "agent.fixture", token, siteRefs: ["home.one"] });
  const identity = { assistantRef: "assistant.one", endpointRef: "endpoint.one", participantRefs: ["participant.one"], audienceRef: "audience.one" };
  const authority = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token, siteRefs: ["home.one"], ttlMs, ...identity });
  const request = { ...identity, authorityContextRef: authority.authorityContextRef, operation: "events.subscribe", siteRef: "home.one", worldRef: "world.personal.v1", executionEnvironmentRef: "replay", requestId: "stream.request", correlationId: "stream.correlation" };
  let sequence = 0;
  const observe = (siteRef = "home.one") => ingestObservation(store, { siteRef, sourceRef: `source.${siteRef}`, externalEntityId: `sensor.${++sequence}`, property: "state", value: sequence, eventTime: new Date(now).toISOString() });
  const open = async (input = request) => {
    const received = { replay: null, events: [], closed: [] };
    const close = await gateway.openEventStream({ token, request: input, onReplay: value => { received.replay = value; }, onEvent: value => received.events.push(value), onClose: reason => received.closed.push(reason) });
    return { ...received, close };
  };
  return { gateway, store, actions, request, observe, open, advance: ms => { now += ms; } };
}

test("authenticated streams preserve replay mode and reject each mismatched scope", async t => {
  const f = await fixture(t);
  for (const change of [{ assistantRef: "other" }, { endpointRef: "other" }, { audienceRef: "other" }, { participantRefs: [] }, { worldRef: "other" }, { siteRef: "home.two" }]) await assert.rejects(f.open({ ...f.request, ...change }), { code: "scope_denied" });
  await assert.rejects(f.open({ ...f.request, executionEnvironmentRef: "other" }), { code: "invalid_request" });
  const stream = await f.open();
  assert.equal(stream.replay.executionEnvironmentRef, "replay");
  assert.equal(stream.replay.requestId, "stream.request");
  await f.observe("home.two"); await f.observe();
  assert.equal(stream.events.length, 1);
  assert.deepEqual(stream.events[0].watch.siteRefs, ["home.one"]);
  assert.ok(Number(stream.events[0].cursor) > 1, "filtered cursors can legitimately skip global events");
});

test("expiry before a live event closes the stream and withholds that event", async t => {
  const f = await fixture(t, { ttlMs: 1000 }); const stream = await f.open();
  f.advance(1001); await f.observe();
  assert.deepEqual(stream.events, []); assert.deepEqual(stream.closed, ["authority_context_expired"]);
});

test("quiet streams close at authority expiry without waiting for an event", async t => {
  const f = await fixture(t, { ttlMs: 30 });
  const reason = new Promise(resolve => f.gateway.openEventStream({ token, request: f.request, onReplay() {}, onEvent() { assert.fail("no event expected"); }, onClose: resolve }).catch(resolve));
  // Keep the test loop alive; the production expiry timer is deliberately unref'd.
  const keepAlive = setTimeout(() => {}, 2000); t.after(() => clearTimeout(keepAlive));
  assert.equal(await reason, "authority_context_expired");
});

test("principal and grant revocation stop live delivery immediately", async t => {
  for (const kind of ["principal", "grant"]) {
    const f = await fixture(t); const stream = await f.open();
    if (kind === "principal") f.gateway.registerPrincipal({ principalRef: "agent.fixture", token, siteRefs: [] });
    else f.actions.registerGrant({ principalRef: "agent.fixture", siteRefs: [], capabilityRefs: [] });
    await f.observe();
    assert.deepEqual(stream.events, []); assert.deepEqual(stream.closed, ["authority_context_invalidated"]);
  }
});

test("authority and world are rechecked after asynchronous replay work", async t => {
  for (const change of ["expiry", "world"]) {
    const f = await fixture(t, { ttlMs: 1000 });
    const original = f.gateway.requestAuthenticated.bind(f.gateway);
    f.gateway.requestAuthenticated = async input => {
      const result = await original(input);
      if (change === "expiry") f.advance(1001);
      else await f.store.transaction(state => { state.worldRef = "world.other"; });
      return result;
    };
    await assert.rejects(f.open(), { code: change === "expiry" ? "authority_context_expired" : "scope_denied" });
  }
});

test("replay-to-live handoff includes events accepted after the asynchronous snapshot", async t => {
  const f = await fixture(t);
  const original = f.gateway.requestAuthenticated.bind(f.gateway);
  f.gateway.requestAuthenticated = async input => { const result = await original(input); await f.observe(); return result; };
  const stream = await f.open();
  assert.equal(stream.replay.events.length, 1);
  await f.observe(); assert.equal(stream.events.length, 1);
  assert.ok(Number(stream.events[0].cursor) > Number(stream.replay.events[0].cursor));
});

test("truncated, expired and future cursors require refresh without a partial replay", async t => {
  for (const kind of ["limit", "expired", "future"]) {
    const f = await fixture(t, { retention: kind === "expired" ? 1 : 500 });
    await f.observe(); await f.observe();
    const stream = await f.open({ ...f.request, limit: 1, afterCursor: kind === "future" ? "999" : "0" });
    assert.equal(stream.replay.resyncRequired, true); assert.deepEqual(stream.replay.events, []);
    assert.equal(stream.replay.resyncReason, { limit: "replay_limit_exceeded", expired: "cursor_expired", future: "cursor_ahead" }[kind]);
    await f.observe(); assert.equal(stream.events.length, 1);
  }
});

test("invalid cursors fail closed and caller mutation cannot alter retained events", async t => {
  const f = await fixture(t);
  for (const afterCursor of ["", "-1", "1.5", "1e2", "9007199254740992", " 0", 0]) await assert.rejects(f.open({ ...f.request, afterCursor }), { code: "invalid_request" });
  const stream = await f.open(); await f.observe();
  stream.events[0].reason = "tampered"; stream.events[0].watch.siteRefs.push("home.two");
  const replay = await f.open();
  assert.equal(replay.replay.events[0].reason, "observation_accepted");
  assert.deepEqual(replay.replay.events[0].watch.siteRefs, ["home.one"]);
  await f.store.transaction(state => { state.worldRef = "world.other"; });
  assert.deepEqual(stream.closed, ["scope_denied"]);
});
