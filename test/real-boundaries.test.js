import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/runtime/state-store.js";
import { HomeAssistantAdapter } from "../src/adapters/home-assistant-adapter.js";
import { ApprovalService } from "../src/actions/approval-service.js";

function store() {
  return new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
}

test("Home Assistant adapter uses a secret reference and bearer REST boundary", async () => {
  const calls = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async (ref) => { assert.equal(ref, "secret://ha/one"); return "transient-token"; }, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ entity_id: "sensor.temperature", state: "21", last_updated: "2026-09-06T12:00:00Z", attributes: {} }), { status: 200, headers: { "content-type": "application/json" } }); } });
  const state = await adapter.getState("sensor.temperature");
  assert.equal(state.siteRef, "home.one");
  assert.equal(calls[0].options.headers.Authorization, "Bearer transient-token");
  assert.equal(adapter.configuration.tokenRef, "secret://ha/one");
  assert.equal(JSON.stringify(await adapter.configuration).includes("transient-token"), false);
});

test("Home Assistant REST requests abort after the configured timeout", async () => {
  let signal;
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, requestTimeoutMs: 5, resolveToken: async () => "transient-token", fetchImpl: async (_url, options) => {
    signal = options.signal;
    await new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true }); });
    return new Response("{}", { status: 200 });
  } });
  await assert.rejects(() => adapter.getState("sensor.temperature"), /request aborted/);
  assert.equal(signal.aborted, true);
});

test("Home Assistant WebSocket authentication fails after the configured timeout", async () => {
  const socket = { send() {}, close() {}, onmessage: null, onerror: null, onclose: null };
  const statuses = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, websocketTimeoutMs: 5, resolveToken: async () => "transient-token", websocketFactory: () => socket, onStatus: (status) => statuses.push(status) });
  await assert.rejects(() => adapter.subscribeStateChanges(async () => {}), /timed out/);
  assert.equal(statuses.at(-1).reason, "websocket_authentication_timeout");
});

test("Home Assistant WebSocket boundary authenticates, subscribes, and normalizes state events", async () => {
  const sent = [];
  const socket = { send: (message) => sent.push(JSON.parse(message)), close: () => {}, onmessage: null, onerror: null, onclose: null };
  const statuses = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async () => "transient-token", websocketFactory: () => socket, onStatus: (status) => statuses.push(status) });
  const observations = [];
  const connected = adapter.subscribeStateChanges(async (observation) => observations.push(observation));
  await Promise.resolve();
  await socket.onmessage({ data: JSON.stringify({ type: "auth_required" }) });
  await socket.onmessage({ data: JSON.stringify({ type: "auth_ok", ha_version: "2026.8" }) });
  await socket.onmessage({ data: JSON.stringify({ type: "event", event: { event_type: "state_changed", data: { new_state: { entity_id: "light.kitchen", state: "on", last_updated: "2026-09-06T12:00:00Z", attributes: {} } } } }) });
  assert.equal((await connected).status, "online");
  assert.equal(sent[0].access_token, "transient-token");
  assert.equal(sent[1].type, "subscribe_events");
  assert.equal(observations[0].externalEntityId, "light.kitchen");
  assert.equal(statuses.at(-1).status, "online");
  socket.onclose();
  assert.equal(statuses.at(-1).status, "offline");
});

test("Home Assistant WebSocket rejects pre-auth close and ignores stale socket status", async () => {
  const sockets = [];
  const statuses = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async () => "transient-token", websocketFactory: () => { const socket = { send() {}, close() {}, onmessage: null, onerror: null, onclose: null }; sockets.push(socket); return socket; }, onStatus: (status) => statuses.push(status) });
  const first = adapter.subscribeStateChanges(async () => {});
  await Promise.resolve();
  await sockets[0].onmessage({ data: JSON.stringify({ type: "auth_required" }) });
  await sockets[0].onmessage({ data: JSON.stringify({ type: "auth_ok" }) });
  await first;
  const second = adapter.subscribeStateChanges(async () => {});
  await Promise.resolve();
  sockets[0].onclose();
  assert.equal(statuses.at(-1).status, "connecting");
  sockets[1].onclose();
  await assert.rejects(second, /closed before authentication/);
});

test("Home Assistant adapter close cancels pending authentication", async () => {
  let socket;
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async () => "transient-token", websocketFactory: () => { socket = { send() {}, close() {}, onmessage: null, onerror: null, onclose: null }; return socket; } });
  const pending = adapter.subscribeStateChanges(async () => {});
  await Promise.resolve();
  adapter.close();
  await assert.rejects(pending, /closed by adapter/);
  assert.equal(typeof socket.close, "function");
});

test("Home Assistant adapter close invalidates token resolution before socket creation", async () => {
  let resolveToken;
  let socketCreated = false;
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: () => new Promise((resolve) => { resolveToken = resolve; }), websocketFactory: () => { socketCreated = true; return {}; } });
  const pending = adapter.subscribeStateChanges(async () => {});
  adapter.close();
  resolveToken("transient-token");
  await assert.rejects(pending, /closed before connection/);
  assert.equal(socketCreated, false);
});

test("Home Assistant WebSocket rejects malformed frames", async () => {
  const socket = { send() {}, close() {}, onmessage: null, onerror: null, onclose: null };
  const statuses = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async () => "transient-token", websocketFactory: () => socket, onStatus: (status) => statuses.push(status) });
  const pending = adapter.subscribeStateChanges(async () => {});
  await Promise.resolve();
  await socket.onmessage({ data: "not-json" });
  await assert.rejects(pending, /invalid message/);
  assert.equal(statuses.at(-1).reason, "websocket_invalid_message");
});

test("Home Assistant WebSocket reports rejected event subscriptions", async () => {
  const sent = [];
  const socket = { send: (message) => sent.push(JSON.parse(message)), close() {}, onmessage: null, onerror: null, onclose: null };
  const statuses = [];
  const adapter = new HomeAssistantAdapter({ store: store(), config: { baseUrl: "http://ha.local:8123", tokenRef: "secret://ha/one", siteRef: "home.one", sourceRef: "ha.one" }, resolveToken: async () => "transient-token", websocketFactory: () => socket, onStatus: (status) => statuses.push(status) });
  const pending = adapter.subscribeStateChanges(async () => {});
  await Promise.resolve();
  await socket.onmessage({ data: JSON.stringify({ type: "auth_required" }) });
  await socket.onmessage({ data: JSON.stringify({ type: "auth_ok" }) });
  await pending;
  await socket.onmessage({ data: JSON.stringify({ id: sent[1].id, type: "result", success: false, error: { code: "not_allowed" } }) });
  assert.equal(statuses.at(-1).reason, "websocket_subscription_failed");
});

test("human approval is bound to the exact action fingerprint and expiry", async () => {
  const stateStore = store();
  let now = new Date("2026-09-06T12:00:00Z");
  const approvals = new ApprovalService({ store: stateStore, clock: () => now });
  const request = { principalRef: "agent.fixture", capabilityRef: "home.light.set_level", operation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.4 } };
  const approval = await approvals.request({ request, requestedBy: "agent.fixture", expiresInMs: 60_000 });
  assert.equal(approval.siteRef, "home.one");
  assert.equal(approval.principalRef, "agent.fixture");
  await approvals.approve({ approvalRef: approval.approvalRef, approvedBy: "human.local" });
  assert.equal(await approvals.verify({ approvalRef: approval.approvalRef, request }), true);
  assert.equal(await approvals.verify({ approvalRef: approval.approvalRef, request: { ...request, principalRef: "agent.other" } }), false);
  assert.equal(await approvals.verify({ approvalRef: approval.approvalRef, request: { ...request, parameters: { level: 0.8 } } }), false);
  assert.equal(await approvals.verify({ approvalRef: approval.approvalRef, request: { ...request, capabilityVersion: "1.0.0" } }), false);
  now = new Date("2026-09-06T12:02:00Z");
  assert.equal(await approvals.verify({ approvalRef: approval.approvalRef, request }), false);
  const expiring = await approvals.request({ request, requestedBy: "agent.fixture", expiresInMs: 60_000 });
  now = new Date("2026-09-06T12:04:00Z");
  await assert.rejects(() => approvals.approve({ approvalRef: expiring.approvalRef, approvedBy: "human.local" }), /approval expired/);
  assert.equal((await stateStore.load()).approvals[expiring.approvalRef].status, "expired");
});
