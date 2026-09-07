import test from "node:test";
import assert from "node:assert/strict";
import { createStudioHttpServer, listAuthorizedSites } from "../src/http/dev-server.js";
import { StateStore, emptyState } from "../src/runtime/state-store.js";
import { createStudioService } from "../src/studio/studio-service.js";

test("creates the local Studio HTTP server with an honest empty runtime", async () => {
  const { server, service, store } = await createStudioHttpServer({ env: {}, store: new StateStore({ state: emptyState() }) });
  assert.equal(typeof server.on, "function");
  assert.equal(service.runtimeStatus().reason, "home_assistant_not_configured");
  assert.equal((await store.load()).sites["home.one"].siteRef, "home.one");
});

test("marks the Home Assistant source degraded when initial sync fails", async () => {
  const store = new StateStore({ state: emptyState() });
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_ONE: "http://ha.local:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://TEST_HA_TOKEN", TEST_HA_TOKEN: "transient-test-token", PWCE_STUDIO_SYNC_ON_START: "true", PWCE_STUDIO_LIVE_EVENTS: "false" },
    fetchImpl: async () => new Response("unavailable", { status: 503 })
  });
  assert.equal(service.runtimeStatus().status, "degraded");
  assert.equal((await store.load()).sources["ha.home.one"].status, "degraded");
  service.stop();
});

test("marks the source degraded when live reconnect fails before socket creation", async () => {
  const store = new StateStore({ state: emptyState() });
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_ONE: "http://ha.local:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://TEST_HA_TOKEN", TEST_HA_TOKEN: "transient-test-token", PWCE_STUDIO_SYNC_ON_START: "false", PWCE_STUDIO_LIVE_EVENTS: "true", PWCE_HA_RECONNECT_MAX_ATTEMPTS: "1" },
    websocketFactory: () => { throw new Error("socket factory unavailable"); }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await store.load()).sources["ha.home.one"].status, "degraded");
  service.stop();
});

test("registers an optional second Home Assistant site without widening the action target", async () => {
  const store = new StateStore({ state: emptyState() });
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_ONE: "http://ha.one:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://TOKEN_ONE", TOKEN_ONE: "token-one", PWCE_HA_URL_HOME_TWO: "http://ha.two:8123", PWCE_HA_TOKEN_REF_HOME_TWO: "env://TOKEN_TWO", TOKEN_TWO: "token-two", PWCE_STUDIO_SYNC_ON_START: "false", PWCE_STUDIO_LIVE_EVENTS: "false" }
  });
  assert.deepEqual(service.siteRefs, ["home.one", "home.two"]);
  const state = await store.load();
  assert.equal(state.sources["ha.home.one"].siteRef, "home.one");
  assert.equal(state.sources["ha.home.two"].siteRef, "home.two");
  assert.equal(service.adapter.configuration.siteRef, "home.one");
  service.stop();
});

test("gives a secondary Home Assistant site bounded live reconnect handling", async () => {
  const store = new StateStore({ state: emptyState() });
  const sockets = [];
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_TWO: "http://ha.two:8123", PWCE_HA_TOKEN_REF_HOME_TWO: "env://TOKEN_TWO", TOKEN_TWO: "token-two", PWCE_STUDIO_SYNC_ON_START: "false", PWCE_STUDIO_LIVE_EVENTS: "true", PWCE_HA_RECONNECT_INITIAL_MS: "0", PWCE_HA_RECONNECT_MAX_MS: "0", PWCE_HA_RECONNECT_MAX_ATTEMPTS: "1" },
    websocketFactory: () => { const socket = { send() {}, close() {}, onmessage: null, onerror: null, onclose: null }; sockets.push(socket); return socket; }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sockets.length, 1);
  sockets[0].onerror();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sockets.length, 2);
  service.stop();
});

test("lists only authorized site identities for Studio inspection", async () => {
  const store = new StateStore({ state: emptyState() });
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_ONE: "http://ha.one:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://TOKEN_ONE", TOKEN_ONE: "token-one", PWCE_HA_URL_HOME_TWO: "http://ha.two:8123", PWCE_HA_TOKEN_REF_HOME_TWO: "env://TOKEN_TWO", TOKEN_TWO: "token-two", PWCE_STUDIO_SYNC_ON_START: "false", PWCE_STUDIO_LIVE_EVENTS: "false" }
  });
  const sites = await listAuthorizedSites({ store, siteRefs: service.siteRefs });
  assert.deepEqual(sites.map((site) => site.siteRef), ["home.one", "home.two"]);
  assert.deepEqual(sites[0].sources.map((source) => source.sourceRef), ["ha.home.one"]);
  service.stop();
});

test("Studio stop reports offline and ignores late adapter status", async () => {
  const store = new StateStore({ state: emptyState() });
  const socket = { send() {}, close() { this.onclose?.(); }, onmessage: null, onerror: null, onclose: null };
  const service = await createStudioService({
    store,
    env: { PWCE_HA_URL_HOME_ONE: "http://ha.local:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://TEST_HA_TOKEN", TEST_HA_TOKEN: "transient-test-token", PWCE_STUDIO_SYNC_ON_START: "false", PWCE_STUDIO_LIVE_EVENTS: "true" },
    websocketFactory: () => socket
  });
  await Promise.resolve();
  service.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(service.runtimeStatus(), { status: "offline", reason: "studio_stopped" });
  assert.equal((await store.load()).sources["ha.home.one"].status, "offline");
});
