import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/runtime/state-store.js";
import { HomeAssistantRuntime } from "../src/runtime/home-assistant-runtime.js";
import { homeAssistantConfigFromEnv, resolveSecretReference } from "../src/config/home-assistant-config.js";
import { HomeAssistantActionTarget } from "../src/actions/home-assistant-target.js";

function stateStore() {
  return new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
}

test("loads Home Assistant configuration from references without storing token values", () => {
  const env = { PWCE_HA_URL_HOME_ONE: "http://ha.local:8123", PWCE_HA_TOKEN_REF_HOME_ONE: "env://PWCE_HA_TOKEN_HOME_ONE", PWCE_HA_TOKEN_HOME_ONE: "secret-value" };
  const config = homeAssistantConfigFromEnv(env);
  assert.equal(config.siteRef, "home.one");
  assert.equal(resolveSecretReference(config.tokenRef, env), "secret-value");
  assert.equal(JSON.stringify(config).includes("secret-value"), false);
});

test("runtime registers a site, syncs read-only states, and writes observations", async () => {
  const store = stateStore();
  const adapter = { getState: async (entityId) => ({ siteRef: "home.one", sourceRef: "ha.one", externalEntityId: entityId, property: "state", value: "on", eventTime: "2026-09-07T12:00:00Z" }) };
  const runtime = new HomeAssistantRuntime({ store, adapter, config: { siteRef: "home.one", sourceRef: "ha.one" } });
  const synced = await runtime.sync(["light.kitchen_lights"]);
  assert.equal(synced.length, 1);
  assert.equal((await store.load()).observations[0].payload.siteRef, "home.one");
});

test("live Home Assistant action maps reversible level to a service call but preserves unknown outcome", async () => {
  const calls = [];
  const target = new HomeAssistantActionTarget({ adapter: { callService: async (...args) => { calls.push(args); return { status: "acknowledged", response: [] }; } } });
  const result = await target.invoke({ executionEnvironmentRef: "live", operation: "light.set_level", targetEntityId: "light.kitchen_lights", parameters: { level: 0.4 } });
  assert.equal(result.status, "outcome_unknown");
  assert.deepEqual(calls, [["light", "turn_on", { entity_id: "light.kitchen_lights", brightness_pct: 40 }]]);
});

test("Home Assistant reconciliation only succeeds when independent state matches", async () => {
  const target = new HomeAssistantActionTarget({ adapter: { getState: async () => ({ value: "on", rawAttributes: { brightness: 102 } }) } });
  const matches = await target.reconcile({ targetEntityId: "light.kitchen_lights", parameters: { level: 0.4 } });
  assert.equal(matches.status, "succeeded");
  const mismatchTarget = new HomeAssistantActionTarget({ adapter: { getState: async () => ({ value: "on", rawAttributes: { brightness: 255 } }) } });
  const mismatch = await mismatchTarget.reconcile({ targetEntityId: "light.kitchen_lights", parameters: { level: 0.4 } });
  assert.equal(mismatch.status, "outcome_unknown");
});

test("Home Assistant action target rejects a request for another site before calling the adapter", async () => {
  let called = false;
  const target = new HomeAssistantActionTarget({ adapter: { configuration: { siteRef: "home.one" }, callService: async () => { called = true; return { status: "acknowledged" }; }, getState: async () => null } });
  const result = await target.invoke({ siteRef: "home.two", executionEnvironmentRef: "live", operation: "light.set_level", targetEntityId: "light.kitchen_lights", parameters: { level: 0.4 } });
  assert.deepEqual(result, { status: "rejected", externalEffectOccurred: false, reasonCode: "target_site_mismatch" });
  assert.equal(called, false);
});
