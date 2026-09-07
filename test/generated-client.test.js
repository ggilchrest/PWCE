import test from "node:test";
import assert from "node:assert/strict";
import { PwceAgentGatewayClient } from "../src/gateway/generated-client.js";

test("generated gateway client emits the published operation names", async () => {
  const requests = [];
  const client = new PwceAgentGatewayClient({ baseUrl: "http://pwce.local", token: "gateway-test-token", fetchImpl: async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  await client.queryContext({ authorityContextRef: "authority.fixture", mode: "current", siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature" });
  await client.getEvidence({ authorityContextRef: "authority.fixture", evidenceRef: "evidence.fixture" });
  await client.publishTrace({ authorityContextRef: "authority.fixture", traceNamespace: "lifestream.interaction", events: [{ event: "started" }] });
  assert.deepEqual(requests.map((request) => request.payload.operation), ["context.query", "evidence.get", "trace.publish"]);
  assert.equal(client.eventsUrl({ authorityContextRef: "authority.fixture", siteRef: "home.one" }), "http://pwce.local/gateway/v1/events?authorityContextRef=authority.fixture&siteRef=home.one&afterCursor=0&limit=100");
});
