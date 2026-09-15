import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/runtime/state-store.js";
import { createGatewayHttpBinding } from "../src/http/gateway-server.js";
import { FixtureExternalAgent } from "../src/agent/fixture-external-agent.js";

function store() {
  return new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
}

async function invoke(binding, { pathname, method = "GET", authorization, payload, contentLength } = {}) {
  let status; let responseHeaders; let value; const chunks = [];
  const parsed = new URL(pathname, "http://127.0.0.1");
  const req = { method, url: `${parsed.pathname}${parsed.search}`, headers: { authorization, ...(payload !== undefined ? { "content-type": "application/json" } : {}), ...(contentLength === undefined ? {} : { "content-length": String(contentLength) }) }, async *[Symbol.asyncIterator]() { if (payload !== undefined) yield JSON.stringify(payload); } };
  const res = { writeHead(code, headers) { status = code; responseHeaders = headers; }, write(text) { chunks.push(text); }, end(text) { value = text ? JSON.parse(text) : chunks.join(""); } };
  await binding.handle(req, res, parsed.pathname);
  return { status, responseHeaders, value };
}

test("authenticated gateway HTTP binding issues authority and delegates requests", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const denied = await invoke(binding, { pathname: "/gateway/v1/profile" });
  assert.equal(denied.status, 401);
  assert.equal(denied.value.error.code, "authentication_failed");
  const profile = await invoke(binding, { pathname: "/gateway/v1/profile", authorization: "Bearer gateway-test-token" });
  assert.equal(profile.status, 200);
  assert.equal(profile.value.operationCatalog.some((entry) => entry.operation === "events.subscribe"), true);
  assert.ok(profile.value.operationCatalogDigest);
  assert.equal(profile.value.schemaStatus, "published");
  assert.match(profile.value.schemaDigest, /^[a-f0-9]{64}$/);
  assert.equal(profile.value.bundleId, "pwce-agent-gateway.bundle.v1");
  assert.equal(profile.value.bundleVersion, "1.0.0");
  const bundle = await invoke(binding, { pathname: "/gateway/v1/bundle", authorization: "Bearer gateway-test-token" });
  assert.equal(bundle.status, 200);
  assert.equal(bundle.value.bundleDigest, profile.value.schemaDigest);
  assert.equal(bundle.value.generatedClient.path, "src/gateway/generated-client.js");
  assert.equal(profile.value.health.status, "development");
  assert.equal(profile.responseHeaders["x-content-type-options"], "nosniff");
  assert.equal(profile.responseHeaders["referrer-policy"], "no-referrer");
  assert.match(profile.responseHeaders["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(profile.responseHeaders.vary, "Authorization, Cookie");
  assert.equal(profile.value.compatibilityRange.minimum, "1.0.0");
  const authorityResponse = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization: "Bearer gateway-test-token", payload: { siteRefs: ["home.one"] } });
  assert.equal(authorityResponse.status, 201);
  const requestResponse = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer gateway-test-token", payload: { operation: "health.get", authorityContextRef: authorityResponse.value.authorityContextRef } });
  assert.equal(requestResponse.status, 200);
  assert.equal(requestResponse.value.profileId, "pwce-agent-gateway.v1");
  const unsupported = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer gateway-test-token", payload: { operation: "unknown.operation", authorityContextRef: authorityResponse.value.authorityContextRef } });
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.value.error.code, "unsupported_operation");
  const events = await invoke(binding, { pathname: `/gateway/v1/events?authorityContextRef=${authorityResponse.value.authorityContextRef}&siteRef=home.one`, authorization: "Bearer gateway-test-token" });
  assert.equal(events.status, 200);
  assert.match(events.value, /text-event-stream|gateway-replay/);
  const invalidEvents = await invoke(binding, { pathname: "/gateway/v1/events?siteRef=home.one", authorization: "Bearer gateway-test-token" });
  assert.equal(invalidEvents.status, 401);
});

test("authenticated HTTP binding delegates every callable catalog operation", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const authorization = "Bearer gateway-test-token";
  const authorityResponse = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization, payload: { siteRefs: ["home.one"] } });
  const authorityContextRef = authorityResponse.value.authorityContextRef;
  const requests = [
    { operation: "context.getPreparedInputs", siteRef: "home.one" },
    { operation: "context.query", mode: "search", siteRef: "home.one", text: "light" },
    { operation: "evidence.get", evidenceRef: "missing-evidence" },
    { operation: "events.subscribe", siteRef: "home.one" },
    { operation: "authority.evaluate", capabilityRef: "home.light.set_level", siteRef: "home.one" },
    { operation: "authority.getGrants" },
    { operation: "capabilities.getSnapshot" },
    { operation: "capabilities.invoke", capabilityRef: "home.light.set_level", siteRef: "home.one", idempotencyKey: "http-catalog-test" },
    { operation: "capabilities.getInvocation", actionRef: "missing-action" },
    { operation: "trace.publish", traceNamespace: "lifestream.http", events: [{ eventRef: "trace-http-1", kind: "assistant.output" }] },
    { operation: "health.get" }
  ];
  for (const payload of requests) {
    const response = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization, payload: { ...payload, authorityContextRef } });
    assert.notEqual(response.status, 404, `${payload.operation} must be delegated, not routed as missing`);
    assert.notEqual(response.value?.error?.code, "unsupported_operation", `${payload.operation} must be implemented or explicitly governed`);
  }
  const trusted = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization, payload: { operation: "authority.authorizeDispatch", authorityContextRef } });
  assert.equal(trusted.value.error.code, "trusted_dispatch_only");
});

test("HTTP authority preserves optional identity isolation fields", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const authorization = "Bearer gateway-test-token";
  const authorityResponse = await invoke(binding, {
    pathname: "/gateway/v1/authority",
    method: "POST",
    authorization,
    payload: { siteRefs: ["home.one"], assistantRef: "assistant.one", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" }
  });
  assert.equal(authorityResponse.status, 201);
  const authorityContextRef = authorityResponse.value.authorityContextRef;
  const accepted = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization, payload: { operation: "health.get", authorityContextRef, assistantRef: "assistant.one", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" } });
  assert.equal(accepted.status, 200);
  const denied = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization, payload: { operation: "health.get", authorityContextRef, assistantRef: "assistant.other", endpointRef: "endpoint.studio", participantRefs: ["participant.owner"], audienceRef: "audience.private" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.value.error.code, "scope_denied");
});

test("HTTP authority rejects payloads outside the published request schema", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const authorization = "Bearer gateway-test-token";
  const unknown = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization, payload: { siteRefs: ["home.one"], secret: "ignored-must-not-be-accepted" } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.value.error.code, "invalid_request");
  const duplicate = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization, payload: { siteRefs: ["home.one", "home.one"] } });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.value.error.code, "invalid_request");
});

test("HTTP gateway rejects JSON POSTs without an application/json content type", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const parsed = new URL("/gateway/v1/authority", "http://127.0.0.1");
  let status; let value;
  const req = { method: "POST", url: parsed.pathname, headers: { authorization: "Bearer gateway-test-token", "content-type": "text/plain" }, async *[Symbol.asyncIterator]() { yield JSON.stringify({ siteRefs: ["home.one"] }); } };
  const res = { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } };
  await binding.handle(req, res, parsed.pathname);
  assert.equal(status, 400);
  assert.equal(value.error.code, "invalid_request");
});

test("HTTP gateway rejects request bodies over the shared transport limit", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const response = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization: "Bearer gateway-test-token", payload: { siteRefs: ["home.one"], padding: "x".repeat(1_048_550) } });
  assert.equal(response.status, 400);
  assert.equal(response.value.error.code, "limit_exceeded");
});

test("HTTP gateway rejects an oversized declared content length before parsing", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const response = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization: "Bearer gateway-test-token", payload: { siteRefs: ["home.one"] }, contentLength: 1_048_577 });
  assert.equal(response.status, 400);
  assert.equal(response.value.error.code, "limit_exceeded");
});

test("HTTP gateway rejects oversized response bodies", async () => {
  const gateway = { registerPrincipal() {}, async requestAuthenticated() { return { padding: "x".repeat(1_048_570) }; } };
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", gateway });
  const response = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer gateway-test-token", payload: { operation: "health.get", authorityContextRef: "authority.fixture" } });
  assert.equal(response.status, 500);
  assert.equal(response.value.error.code, "limit_exceeded");
});

test("HTTP gateway rejects an oversized initial SSE frame", async () => {
  const gateway = { registerPrincipal() {}, async requestAuthenticated() { return { events: [{ cursor: "1", type: "context.invalidated", payload: "x".repeat(1_048_500) }] }; } };
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", gateway });
  const response = await invoke(binding, { pathname: "/gateway/v1/events?authorityContextRef=authority.fixture&siteRef=home.one", authorization: "Bearer gateway-test-token" });
  assert.equal(response.status, 400);
  assert.equal(response.value.error.code, "limit_exceeded");
});

test("fixture external Agent uses only the gateway HTTP contract", async () => {
  const calls = [];
  const responses = [
    { ok: true, value: { profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65", compatibilityRange: { minimum: "1.0.0", maximum: "1.x" }, health: { status: "development" }, fixtures: [{ fixtureSetId: "pwce.shared.contract.vectors", fixtureSetVersion: "0.1.0" }], operationCatalog: [{ operation: "context.query" }, { operation: "authority.getGrants" }, { operation: "health.get" }] } },
    { ok: true, value: { authorityContextRef: "authority.fixture", expiresAt: "2026-09-07T12:05:00Z", siteRefs: ["home.one"] } },
    { ok: true, value: { status: "known", value: 21, evidenceRefs: ["evidence.fixture"], limitations: [] } }
  ];
  responses[0].value.bundleId = "pwce-agent-gateway.bundle.v1";
  responses[0].value.bundleVersion = "1.0.0";
  const agent = new FixtureExternalAgent({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url, options) => { calls.push({ url, options }); const next = responses.shift(); return new Response(JSON.stringify(next.value), { status: next.ok ? 200 : 400, headers: { "content-type": "application/json" } }); } });
  const result = await agent.answer({ question: "What is the temperature?", entityId: "sensor.temperature", property: "temperature" });
  assert.match(result.answer, /21/);
  assert.deepEqual(result.evidenceRefs, ["evidence.fixture"]);
  assert.equal(calls.every((call) => call.options.headers.Authorization === "Bearer gateway-test-token"), true);
  assert.equal(calls.some((call) => call.url.endsWith("/gateway/v1/request")), true);
});

test("fixture external Agent fails closed on a catalog digest mismatch", async () => {
  const agent = new FixtureExternalAgent({
    baseUrl: "http://pwce.local",
    token: "gateway-test-token",
    fetchImpl: async () => new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", operationCatalogVersion: "0.1.0", operationCatalogDigest: "wrong", operationCatalog: [{ operation: "context.query" }, { operation: "authority.getGrants" }, { operation: "health.get" }] }), { status: 200, headers: { "content-type": "application/json" } })
  });
  await assert.rejects(() => agent.profile(), { code: "incompatible_gateway_profile" });
});

test("fixture external Agent fails closed when compatibility metadata is incomplete", async () => {
  const agent = new FixtureExternalAgent({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async () => new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65", operationCatalog: [{ operation: "context.query" }, { operation: "authority.getGrants" }, { operation: "health.get" }] }), { status: 200, headers: { "content-type": "application/json" } }) });
  await assert.rejects(() => agent.profile(), { code: "incompatible_gateway_profile" });
});


test("gateway HTTP body cannot replace bearer authentication or reach the service with non-object input", async (t) => {
  const binding = createGatewayHttpBinding({ store: store(), token: "synthetic-gateway-token", siteRefs: ["home.one"] });
  t.after(() => binding.gateway.close());
  const authority = await invoke(binding, { pathname: "/gateway/v1/authority", method: "POST", authorization: "Bearer synthetic-gateway-token", payload: { siteRefs: ["home.one"] } });
  assert.equal(authority.status, 201);
  let calls = 0; const original = binding.gateway.requestAuthenticated.bind(binding.gateway);
  binding.gateway.requestAuthenticated = async (request) => { calls++; return original(request); };
  for (const authorization of [undefined, "Bearer wrong-token", "Bearer synthetic-gateway-token"]) {
    const result = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization, payload: { operation: "health.get", authorityContextRef: authority.value.authorityContextRef, token: "synthetic-gateway-token" } });
    assert.equal(result.status, 400); assert.equal(result.value.error.code, "invalid_request");
    assert.doesNotMatch(JSON.stringify(result.value), /synthetic-gateway-token/);
  }
  for (const payload of [null, [], "invalid", 7]) {
    const result = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer synthetic-gateway-token", payload });
    assert.equal(result.status, 400); assert.equal(result.value.error.code, "invalid_request");
  }
  assert.equal(calls, 0, "invalid input never reaches authenticated gateway operations");
  const denied = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer wrong-token", payload: { operation: "health.get", authorityContextRef: authority.value.authorityContextRef } });
  assert.equal(denied.status, 401);
  const valid = await invoke(binding, { pathname: "/gateway/v1/request", method: "POST", authorization: "Bearer synthetic-gateway-token", payload: { operation: "health.get", authorityContextRef: authority.value.authorityContextRef } });
  assert.equal(valid.status, 200); assert.equal(valid.value.profileId, "pwce-agent-gateway.v1");
});
