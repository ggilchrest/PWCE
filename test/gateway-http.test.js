import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/runtime/state-store.js";
import { createGatewayHttpBinding } from "../src/http/gateway-server.js";
import { FixtureExternalAgent } from "../src/agent/fixture-external-agent.js";

function store() {
  return new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
}

async function invoke(binding, { pathname, method = "GET", authorization, payload } = {}) {
  let status; let value; const chunks = [];
  const parsed = new URL(pathname, "http://127.0.0.1");
  const req = { method, url: `${parsed.pathname}${parsed.search}`, headers: { authorization }, async *[Symbol.asyncIterator]() { if (payload) yield JSON.stringify(payload); } };
  const res = { writeHead(code) { status = code; }, write(text) { chunks.push(text); }, end(text) { value = text ? JSON.parse(text) : chunks.join(""); } };
  await binding.handle(req, res, parsed.pathname);
  return { status, value };
}

test("authenticated gateway HTTP binding issues authority and delegates requests", async () => {
  const binding = createGatewayHttpBinding({ store: store(), token: "gateway-test-token", siteRefs: ["home.one"] });
  const denied = await invoke(binding, { pathname: "/gateway/v1/profile" });
  assert.equal(denied.status, 401);
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

test("fixture external Agent uses only the gateway HTTP contract", async () => {
  const calls = [];
  const responses = [
    { ok: true, value: { profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "2eb0c47b65cc254edf09b2893fab1eb36e00142eb361649798bec65c2f08fe11", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65", compatibilityRange: { minimum: "1.0.0", maximum: "1.x" }, health: { status: "development" }, fixtures: [{ fixtureSetId: "pwce.shared.contract.vectors", fixtureSetVersion: "0.1.0" }], operationCatalog: [{ operation: "context.query" }, { operation: "authority.getGrants" }, { operation: "health.get" }] } },
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
