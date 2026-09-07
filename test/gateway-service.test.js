import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/runtime/state-store.js";
import { registerSite, registerSource } from "../src/domain/identity.js";
import { HomeAssistantFixtureAdapter } from "../src/adapters/home-assistant-fixture.js";
import { GatewayService } from "../src/gateway/gateway-service.js";
import { ingestObservation } from "../src/domain/observation-service.js";
import { ActionService } from "../src/actions/action-service.js";
import { ApprovalService } from "../src/actions/approval-service.js";
import { FixtureActionTarget } from "../src/actions/fixture-target.js";
import { BasicAgent } from "../src/agent/basic-agent.js";

async function configured() {
  const store = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
  await store.transaction((state) => {
    registerSite(state, { siteRef: "home.one", name: "Home One" });
    registerSite(state, { siteRef: "home.two", name: "Home Two" });
    registerSource(state, { sourceRef: "ha.one", siteRef: "home.one" });
    registerSource(state, { sourceRef: "ha.two", siteRef: "home.two" });
  });
  const one = new HomeAssistantFixtureAdapter({ store, siteRef: "home.one", sourceRef: "ha.one", now: () => new Date("2026-09-06T12:00:10Z") });
  const two = new HomeAssistantFixtureAdapter({ store, siteRef: "home.two", sourceRef: "ha.two", now: () => new Date("2026-09-06T12:00:10Z") });
  await one.connect();
  await two.connect();
  await one.emitState({ entityId: "sensor.temperature", property: "temperature", value: 21, eventTime: "2026-09-06T12:00:00Z" });
  await two.emitState({ entityId: "sensor.temperature", property: "temperature", value: 18, eventTime: "2026-09-06T12:00:00Z" });
  let currentTime = new Date("2026-09-06T12:00:10Z");
  const gateway = new GatewayService({ store, clock: () => currentTime });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  return { store, gateway, advanceClock: (value) => { currentTime = new Date(value); } };
}

test("issues scoped authority without persisting the secret", async () => {
  const { store, gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  assert.equal(context.siteRefs[0], "home.one");
  assert.equal(JSON.stringify(await store.load()).includes("fixture-secret-token"), false);
});

test("gateway calls carry request boundaries and reject mismatched world or mode", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const result = await gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, requestId: "request.test.001", correlationId: "correlation.test.001", executionEnvironmentRef: "replay" });
  assert.equal(result.requestId, "request.test.001");
  assert.equal(result.correlationId, "correlation.test.001");
  assert.equal(result.worldRef, "world.personal.v1");
  assert.equal(result.executionEnvironmentRef, "replay");
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, worldRef: "world.other" }), (error) => error.code === "scope_denied");
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, executionEnvironmentRef: "unknown" }), (error) => error.code === "invalid_request");
});

test("authority contexts bind optional audience identities independently", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"], assistantRef: "assistant.one", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" });
  const result = await gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, assistantRef: "assistant.one", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" });
  assert.equal(result.status, "healthy");
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, assistantRef: "assistant.other", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" }), (error) => error.code === "scope_denied");
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef, assistantRef: "assistant.one", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.other" }), (error) => error.code === "scope_denied");
});

test("serves current context and evidence through the read-only gateway", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const current = await gateway.request({ operation: "context.query", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: context.authorityContextRef });
  assert.equal(current.value, 21);
  assert.ok(current.sliceRef);
  assert.equal(current.knowledgeState, "current");
  assert.equal(current.basis, "observed");
  assert.ok(current.invalidationCursor);
  const ageBound = await gateway.request({ operation: "context.query", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", maxAgeMs: 1, authorityContextRef: context.authorityContextRef });
  assert.equal(ageBound.status, "stale");
  assert.equal(ageBound.freshnessAccepted, false);
  assert.equal("value" in ageBound, false);
  const staleAllowed = await gateway.request({ operation: "context.query", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", maxAgeMs: 1, allowStale: true, authorityContextRef: context.authorityContextRef });
  assert.equal(staleAllowed.value, 21);
  assert.equal(staleAllowed.freshnessAccepted, false);
  const evidence = await gateway.request({ operation: "evidence.get", evidenceRef: current.evidenceRefs[0], authorityContextRef: context.authorityContextRef });
  assert.equal(evidence.evidence.payload.siteRef, "home.one");
  assert.equal(evidence.sourceRef, "ha.one");
  assert.ok(evidence.integrity.value);
  assert.deepEqual(evidence.transformationRefs, ["pwce.normalize.home-assistant.v1"]);
  assert.ok(evidence.limitations.length);
});

test("accepts bounded namespaced trace custody without treating it as World truth", async () => {
  const { gateway, store } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const result = await gateway.request({ operation: "trace.publish", authorityContextRef: context.authorityContextRef, requestId: "trace-request.001", correlationId: "trace-correlation.001", executionEnvironmentRef: "replay", traceNamespace: "lifestream.turn", events: [{ eventRef: "trace.001", kind: "assistant.output", payload: { text: "hello" } }] });
  assert.equal(result.acceptedEventCount, 1);
  assert.equal(result.custody, "pwce_bounded_development");
  const state = await store.load();
  assert.equal(state.audit.at(-1).type, "gateway.trace");
  assert.equal(state.audit.at(-1).events[0].kind, "assistant.output");
  assert.equal(state.audit.at(-1).requestId, "trace-request.001");
  assert.equal(state.audit.at(-1).executionEnvironmentRef, "replay");
  await assert.rejects(() => gateway.request({ operation: "trace.publish", authorityContextRef: context.authorityContextRef, traceNamespace: "pwce.internal", events: [{ eventRef: "trace.002" }] }), (error) => error.code === "invalid_request");
});

test("Basic Agent answers current and historical questions through the gateway", async () => {
  const { gateway } = await configured();
  const agent = new BasicAgent({ gateway, siteRefs: ["home.one"], entityId: "sensor.temperature" });
  assert.equal(agent.definition.effectAuthority, "none");
  const current = await agent.answer({ question: "What is the temperature?", entityId: "sensor.temperature", property: "temperature" });
  assert.equal(current.mode, "current");
  assert.match(current.answer, /21/);
  assert.equal(current.evidenceRefs.length, 1);
  const history = await agent.answer({ question: "Show the recent history", entityId: "sensor.temperature", property: "temperature" });
  assert.equal(history.mode, "history");
  assert.equal(history.result.observations.length, 1);
});

test("Basic Agent preserves a gateway conflict instead of selecting a value", async () => {
  const { gateway, store } = await configured();
  await store.transaction((state) => registerSource(state, { sourceRef: "ha.one.secondary", siteRef: "home.one", name: "Home Assistant One Secondary" }));
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 21, eventTime: "2026-09-06T12:00:11Z", idempotencyKey: "agent-conflict-one" });
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one.secondary", externalEntityId: "sensor.temperature", property: "temperature", value: 18, eventTime: "2026-09-06T12:00:11Z", idempotencyKey: "agent-conflict-two" });
  const agent = new BasicAgent({ gateway, siteRefs: ["home.one"], entityId: "sensor.temperature" });
  const answer = await agent.answer({ question: "What is the temperature?", entityId: "sensor.temperature", property: "temperature" });
  assert.equal(answer.result.status, "conflicted");
  assert.match(answer.answer, /conflicting/);
  assert.equal(answer.evidenceRefs.length, 2);
});

test("fails closed on profile mismatch, expiry, and cross-site access", async () => {
  const { gateway, advanceClock } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"], ttlMs: 1 });
  await assert.rejects(() => gateway.request({ profileVersion: "2.0.0", operation: "health.get", authorityContextRef: context.authorityContextRef }), (error) => error.code === "incompatible_gateway_profile");
  advanceClock("2026-09-06T12:00:11Z");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: context.authorityContextRef }), (error) => error.code === "authority_context_expired");
  const fresh = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "current", siteRef: "home.two", externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: fresh.authorityContextRef }), (error) => error.code === "scope_denied");
});

test("returns an explicit no-effect capability snapshot", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const snapshot = await gateway.request({ operation: "capabilities.getSnapshot", authorityContextRef: context.authorityContextRef });
  assert.deepEqual(snapshot.capabilities, []);
  assert.equal(snapshot.availability, "none");
  assert.deepEqual(snapshot.siteRefs, ["home.one"]);
  assert.ok(snapshot.expiresAt);
  assert.ok(snapshot.snapshotRef);
  assert.ok(snapshot.issuedAt);
  assert.equal(snapshot.invalidationSequence, 0);
});

test("returns bounded prepared inputs and caller grant view", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const prepared = await gateway.request({ operation: "context.getPreparedInputs", siteRef: "home.one", authorityContextRef: context.authorityContextRef });
  assert.equal(prepared.knowledgeState, "known");
  assert.equal(prepared.inputs[0].value, 21);
  assert.equal(prepared.inputs[0].evidenceRefs.length, 1);
  assert.equal(prepared.inputs.some((input) => input.value === 18), false);
  assert.equal(prepared.hasMore, false);
  await assert.rejects(() => gateway.request({ operation: "context.getPreparedInputs", siteRef: "home.one", limit: 0, authorityContextRef: context.authorityContextRef }), (error) => error.code === "invalid_request");
  await assert.rejects(() => gateway.request({ operation: "context.getPreparedInputs", siteRef: "home.one", maxBytes: 256, authorityContextRef: context.authorityContextRef }), (error) => error.code === "limit_exceeded");
  const grants = await gateway.request({ operation: "authority.getGrants", authorityContextRef: context.authorityContextRef });
  assert.equal(grants.principalRef, "agent.fixture");
  assert.deepEqual(grants.capabilityRefs, []);
});

test("supports a bounded site-scoped search without entity selectors", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const search = await gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "temperature", limit: 1, authorityContextRef: context.authorityContextRef });
  assert.equal(search.status, "known");
  assert.equal(search.matches.length, 1);
  assert.equal(search.matches[0].siteRef, "home.one");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "x", limit: 101, authorityContextRef: context.authorityContextRef }), (error) => error.code === "invalid_request");
  const bounded = await gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "temperature", detail: "summary", maxBytes: 4096, authorityContextRef: context.authorityContextRef });
  assert.equal(bounded.detail, "summary");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "temperature", detail: "verbose", authorityContextRef: context.authorityContextRef }), (error) => error.code === "invalid_request");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "temperature", maxBytes: 256, authorityContextRef: context.authorityContextRef }), (error) => error.code === "limit_exceeded");
});

test("returns site-qualified items for an authorized multi-site current query", async () => {
  const { gateway } = await configured();
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one", "home.two"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one", "home.two"] });
  const result = await gateway.request({ operation: "context.query", mode: "current", siteRefs: ["home.one", "home.two"], externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: context.authorityContextRef });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.siteRef), ["home.one", "home.two"]);
  assert.deepEqual(result.items.map((item) => item.value), [21, 18]);
  assert.equal(result.items[0].entityRef, "home.one::sensor.temperature");
  const narrowed = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "current", siteRefs: ["home.one", "home.two"], externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: narrowed.authorityContextRef }), (error) => error.code === "scope_denied");
});

test("search honors the requested site selector inside a multi-site authority", async () => {
  const { gateway } = await configured();
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one", "home.two"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one", "home.two"] });
  const result = await gateway.request({ operation: "context.query", mode: "search", siteRef: "home.one", text: "temperature", authorityContextRef: context.authorityContextRef });
  assert.equal(result.matches.every((match) => match.siteRef === "home.one"), true);
  assert.equal(result.matches.some((match) => match.siteRef === "home.two"), false);
});

test("decorates history, as-of, and explain queries with slice metadata", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  for (const mode of ["history", "asOf", "explain"]) {
    const query = { operation: "context.query", mode, siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", authorityContextRef: context.authorityContextRef };
    if (mode === "asOf") query.asOf = "2026-09-06T12:00:05Z";
    const result = await gateway.request(query);
    assert.ok(result.sliceRef);
    assert.equal(result.siteRef, "home.one");
    assert.ok(result.evaluatedAt);
    assert.equal(result.knowledgeState, "current");
    assert.equal(result.basis, "observed");
  }
});

test("bounds history results and resumes with a source-bound cursor", async () => {
  const { gateway, store } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 22, eventTime: "2026-09-06T12:00:11Z", idempotencyKey: "ha.one:temperature-later" });
  const result = await gateway.request({ operation: "context.query", mode: "history", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 1, authorityContextRef: context.authorityContextRef });
  assert.equal(result.observations.length, 1);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
  const continued = await gateway.request({ operation: "context.query", mode: "history", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 1, cursor: result.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.equal(continued.observations[0].value, 22);
  assert.equal(continued.hasMore, false);
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 23, eventTime: "2026-09-06T12:00:12Z", idempotencyKey: "ha.one:temperature-latest" });
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "history", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 1, cursor: result.nextCursor, authorityContextRef: context.authorityContextRef }), (error) => error.code === "cursor_stale");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "history", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 1, cursor: result.nextCursor, from: "2026-09-06T12:00:11Z", authorityContextRef: context.authorityContextRef }), (error) => error.code === "invalid_request");
  await assert.rejects(() => gateway.request({ operation: "context.query", mode: "history", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 101, authorityContextRef: context.authorityContextRef }), (error) => error.code === "invalid_request");
});

test("authority evaluation is explicit and non-admitting when effects are unactivated", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const evaluation = await gateway.request({ operation: "authority.evaluate", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", siteRef: "home.one", arguments: { level: 0.5 } });
  assert.equal(evaluation.outcome, "denied");
  assert.deepEqual(evaluation.rationaleCodes, ["effect_capabilities_not_activated"]);
});

test("keeps trusted dispatch authorization separate from Agent-callable requests", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  await assert.rejects(() => gateway.request({ operation: "authority.authorizeDispatch", authorityContextRef: context.authorityContextRef }), (error) => error.code === "trusted_dispatch_only");
});

test("gateway invalidation replay is site-scoped and cursor-based", async () => {
  const { gateway, store } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const before = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", authorityContextRef: context.authorityContextRef });
  assert.deepEqual(before.events, []);
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.humidity", property: "humidity", value: 45, eventTime: "2026-09-06T12:00:09Z", idempotencyKey: "ha.one:humidity" });
  const after = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: before.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.equal(after.events.length, 1);
  assert.equal(after.events[0].type, "context.invalidated");
  assert.equal(after.events[0].affectedRef, "home.one::sensor.humidity");
});

test("gateway replay includes provider degradation and action updates", async () => {
  const { gateway, store } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const before = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", authorityContextRef: context.authorityContextRef });
  await store.transaction((state) => { state.sources["ha.one"].status = "offline"; state.sources["ha.one"].lastStatusReason = "test_disconnect"; });
  const after = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: before.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.equal(after.events.some((event) => event.type === "provider.degraded" && event.affectedRef === "ha.one"), true);
});

test("filtered gateway cursors advance past irrelevant site events", async () => {
  const { gateway, store } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const before = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", authorityContextRef: context.authorityContextRef });
  await ingestObservation(store, { siteRef: "home.two", sourceRef: "ha.two", externalEntityId: "sensor.other", property: "state", value: "on", eventTime: "2026-09-06T12:00:09Z", idempotencyKey: "ha.two:other" });
  const after = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: before.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.deepEqual(after.events, []);
  assert.equal(after.nextCursor, "1");
});

test("gateway effect path uses the governed ActionService when activated", async () => {
  const { store } = await configured();
  const approvals = new ApprovalService({ store });
  const actions = new ActionService({ store, target: new FixtureActionTarget(), approvalService: approvals });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const evaluation = await gateway.request({ operation: "authority.evaluate", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", capabilityOperation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "test", approvalRequired: false });
  assert.equal(evaluation.outcome, "allowed");
  const invocation = await gateway.request({ operation: "capabilities.invoke", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", capabilityOperation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "test", approvalRequired: false, idempotencyKey: "gateway-test-action" });
  assert.equal(invocation.status, "completed");
  assert.equal(invocation.result.status, "succeeded");
  const status = await gateway.request({ operation: "capabilities.getInvocation", authorityContextRef: context.authorityContextRef, actionRef: invocation.actionRef });
  assert.equal(status.status, "known");
  const grants = await gateway.request({ operation: "authority.getGrants", authorityContextRef: context.authorityContextRef });
  assert.deepEqual(grants.capabilityRefs, ["home.light.set_level"]);
  await assert.rejects(() => gateway.request({ operation: "capabilities.invoke", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", capabilityOperation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "test", approvalRequired: false }), (error) => error.code === "invalid_request");
});

test("gateway does not replay an old action update after an unrelated state write", async () => {
  const { store } = await configured();
  const approvals = new ApprovalService({ store });
  const actions = new ActionService({ store, target: new FixtureActionTarget(), approvalService: approvals });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const before = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", authorityContextRef: context.authorityContextRef });
  const admitted = await actions.authorizeDispatch({ principalRef: "agent.fixture", capabilityRef: "home.light.set_level", operation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "test", approvalRequired: false, idempotencyKey: "gateway-event-dedup" });
  await actions.dispatch(admitted.action.actionRef);
  const afterAction = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: before.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.equal(afterAction.events.filter((event) => event.type === "action.updated").length, 2);
  await store.transaction((state) => { state.audit.push({ type: "unrelated.write", recordedAt: "2026-09-06T12:00:11Z" }); });
  const afterUnrelated = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: afterAction.nextCursor, authorityContextRef: context.authorityContextRef });
  assert.deepEqual(afterUnrelated.events, []);
});

test("gateway grant view cannot widen a narrowed authority context", async () => {
  const { store } = await configured();
  const actions = new ActionService({ store, target: new FixtureActionTarget() });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one", "home.two"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one", "home.two"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const grants = await gateway.request({ operation: "authority.getGrants", authorityContextRef: context.authorityContextRef });
  assert.deepEqual(grants.siteRefs, ["home.one"]);
});

test("gateway signals resynchronization after cursor retention is exceeded", async () => {
  const { store } = await configured();
  const gateway = new GatewayService({ store, eventRetention: 2 });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  for (let index = 0; index < 3; index += 1) await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: `sensor.retained_${index}`, property: "state", value: index, eventTime: `2026-09-06T12:00:0${index}Z`, idempotencyKey: `retention:${index}` });
  const replay = await gateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: "0", authorityContextRef: context.authorityContextRef });
  assert.equal(replay.resyncRequired, true);
  assert.deepEqual(replay.events, []);
});

test("gateway invalidation replay survives service restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-gateway-replay-"));
  const path = join(directory, "state.json");
  const firstStore = new StateStore({ path });
  await firstStore.transaction((state) => {
    registerSite(state, { siteRef: "home.one", name: "Home One" });
    registerSource(state, { sourceRef: "ha.one", siteRef: "home.one" });
  });
  const firstGateway = new GatewayService({ store: firstStore });
  firstGateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const firstContext = firstGateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  await ingestObservation(firstStore, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.restart", property: "state", value: "on", eventTime: "2026-09-07T12:00:00Z", idempotencyKey: "restart-event" });
  const beforeRestart = await firstGateway.request({ operation: "events.subscribe", siteRef: "home.one", authorityContextRef: firstContext.authorityContextRef });
  assert.equal(beforeRestart.events.some((event) => event.type === "context.invalidated"), true);
  firstGateway.close();

  const secondStore = new StateStore({ path });
  const secondGateway = new GatewayService({ store: secondStore });
  secondGateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const secondContext = secondGateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const replay = await secondGateway.request({ operation: "events.subscribe", siteRef: "home.one", afterCursor: "0", authorityContextRef: secondContext.authorityContextRef });
  assert.equal(replay.events.some((event) => event.type === "context.invalidated"), true);
  assert.equal(replay.resyncRequired, false);
  secondGateway.close();
});

test("grant revision invalidates an existing effect authority context", async () => {
  const { store } = await configured();
  const actions = new ActionService({ store, target: new FixtureActionTarget() });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const events = [];
  const close = gateway.openEventStream({ siteRef: "home.one", principalRef: "agent.fixture", onEvent: (event) => events.push(event) });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: [], capabilityRefs: [] });
  close();
  assert.equal(events.some((event) => event.type === "authority.invalidated" && event.reason === "grant_revision_changed"), true);
  assert.equal(events.some((event) => event.type === "capabilities.invalidated" && event.reason === "grant_revision_changed"), true);
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef }), (error) => error.code === "authority_context_invalidated");
});

test("principal revision invalidates previously issued authority", async () => {
  const { gateway } = await configured();
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "rotated-secret-token", siteRefs: ["home.one"] });
  await assert.rejects(() => gateway.request({ operation: "health.get", authorityContextRef: context.authorityContextRef }), (error) => error.code === "authority_context_invalidated");
});

test("live gateway evaluation cannot bypass runtime approval", async () => {
  const { store } = await configured();
  const actions = new ActionService({ store, target: new FixtureActionTarget(), liveEffectsEnabled: true });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const evaluation = await gateway.request({ operation: "authority.evaluate", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", capabilityOperation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "live", approvalRequired: false });
  assert.equal(evaluation.outcome, "approval_required");
});

test("gateway preserves uncertain and denied invocation outcomes", async () => {
  const { store } = await configured();
  const actions = new ActionService({ store, target: new FixtureActionTarget({ mode: "unknown" }) });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gateway = new GatewayService({ store, actionService: actions });
  gateway.registerPrincipal({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const context = gateway.issueAuthorityContext({ principalRef: "agent.fixture", token: "fixture-secret-token", siteRefs: ["home.one"] });
  const invocation = await gateway.request({ operation: "capabilities.invoke", authorityContextRef: context.authorityContextRef, capabilityRef: "home.light.set_level", capabilityOperation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.5 }, executionEnvironmentRef: "test", approvalRequired: false, idempotencyKey: "gateway-unknown-action" });
  assert.equal(invocation.status, "outcome_unknown");
  assert.equal(invocation.result.externalEffectOccurred, "unknown");
});
