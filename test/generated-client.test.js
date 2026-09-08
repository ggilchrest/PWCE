import test from "node:test";
import assert from "node:assert/strict";
import { PwceAgentGatewayClient } from "../src/gateway/generated-client.js";

test("generated gateway client emits the published operation names", async () => {
  const requests = [];
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url, options) => {
    if (url.endsWith("/profile")) return new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" }), { status: 200, headers: { "content-type": "application/json" } });
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  await client.queryContext({ authorityContextRef: "authority.fixture", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature" });
  await client.getEvidence({ authorityContextRef: "authority.fixture", evidenceRef: "evidence.fixture" });
  await client.publishTrace({ authorityContextRef: "authority.fixture", traceNamespace: "lifestream.interaction", events: [{ event: "started" }] });
  assert.deepEqual(requests.map((request) => request.payload.operation), ["context.query", "evidence.get", "trace.publish"]);
  assert.equal(client.eventsUrl({ authorityContextRef: "authority.fixture", siteRef: "home.one" }), "http://pwce.local/gateway/v1/events?authorityContextRef=authority.fixture&siteRef=home.one&afterCursor=0&limit=100");
});

test("generated gateway client fails closed on profile incompatibility", async () => {
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async () => new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", schemaStatus: "published", schemaDigest: "wrong" }), { status: 200, headers: { "content-type": "application/json" } }) });
  await assert.rejects(() => client.queryContext({ authorityContextRef: "authority.fixture", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature" }), { code: "incompatible_gateway_profile" });
});

test("generated gateway client preserves typed static transport errors", async () => {
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async () => new Response(JSON.stringify({ error: { code: "authentication_failed", message: "authentication failed" } }), { status: 401 }) });
  await assert.rejects(() => client.profile(), { code: "authentication_failed" });
});

test("generated gateway client negotiates before issuing authority", async () => {
  const paths = [];
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url) => {
    paths.push(url);
    if (url.endsWith("/profile")) return new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" }), { status: 200 });
    return new Response(JSON.stringify({ authorityContextRef: "authority.fixture" }), { status: 201 });
  } });
  await client.authority({ siteRefs: ["home.one"] });
  assert.deepEqual(paths, ["http://pwce.local/gateway/v1/profile", "http://pwce.local/gateway/v1/authority"]);
});

test("generated gateway client verifies the published bundle descriptor", async () => {
  const profile = { profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" };
  const bundle = { bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", bundleDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", artifacts: [], generatedClient: { path: "src/gateway/generated-client.js", status: "checked_in", sha256: "9ea91dab7359a9c52d55ecb4f081b8eb9a0dff5ed90ea3272220637660b80406" } };
  let bundleCalls = 0;
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url) => {
    if (url.endsWith("/profile")) return new Response(JSON.stringify(profile), { status: 200 });
    bundleCalls += 1;
    return new Response(JSON.stringify(bundle), { status: 200 });
  } });
  await assert.rejects(() => client.bundle(), { code: "incompatible_gateway_bundle" });
  assert.equal(bundleCalls, 1);
});

test("generated gateway client parses bounded invalidation SSE frames", async () => {
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url) => {
    if (url.endsWith("/profile")) return new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" }), { status: 200 });
    return new Response(": gateway-replay\nid: 7\nevent: context.invalidated\ndata: {\"eventId\":\"evt-7\"}\n\nid: 8\nevent: resync.required\ndata: {\"reason\":\"cursor_expired\"}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  } });
  const events = [];
  for await (const event of client.subscribeInvalidations({ authorityContextRef: "authority.fixture", siteRef: "home.one" })) events.push(event);
  assert.deepEqual(events, [
    { id: "7", event: "context.invalidated", data: "{\"eventId\":\"evt-7\"}" },
    { id: "8", event: "resync.required", data: "{\"reason\":\"cursor_expired\"}" }
  ]);
});

test("generated gateway client rejects oversized JSON before transport", async () => {
  const calls = [];
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" }), { status: 200 });
  } });
  await assert.rejects(() => client.authority({ siteRefs: ["home.one"], padding: "x".repeat(1_048_550) }), { code: "limit_exceeded" });
  assert.deepEqual(calls, ["http://pwce.local/gateway/v1/profile"]);
});

test("generated gateway client rejects oversized JSON responses", async () => {
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async () => new Response("x".repeat(1_048_577), { status: 200 }) });
  await assert.rejects(() => client.profile(), { code: "limit_exceeded" });
});

test("generated gateway client rejects an oversized unterminated SSE frame", async () => {
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url) => {
    if (url.endsWith("/profile")) return new Response(JSON.stringify({ profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2", operationCatalogVersion: "0.1.0", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65" }), { status: 200 });
    return new Response("data: " + "x".repeat(1_048_571), { status: 200, headers: { "content-type": "text/event-stream" } });
  } });
  const iterator = client.subscribeInvalidations({ authorityContextRef: "authority.fixture", siteRef: "home.one" });
  await assert.rejects(() => iterator.next(), { code: "limit_exceeded" });
});
