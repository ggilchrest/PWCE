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
  assert.deepEqual(calls, [["light", "turn_on", { entity_id: "light.kitchen_lights", brightness_pct: 40 }, { signal: undefined }]]);
});

test("Home Assistant reconciliation only succeeds when fresh independent scoped state matches", async () => {
  const configuration = { siteRef: 'home.one', sourceRef: 'ha.one', baseUrl: 'http://synthetic.invalid' };
  const state = { siteRef: 'home.one', sourceRef: 'ha.one', externalEntityId: 'light.synthetic', eventTime: '2026-09-15T12:00:01Z', value: 'on', rawAttributes: { brightness: 102 } };
  const action = { siteRef: 'home.one', executionEnvironmentRef: 'live', operation: 'light.set_level', attemptRef: 'synthetic-attempt', startedAt: '2026-09-15T12:00:00Z', targetEntityId: 'light.synthetic', parameters: { level: 0.4 } };
  const target = new HomeAssistantActionTarget({ adapter: { configuration, getState: async () => state }, clock: () => new Date('2026-09-15T12:00:02Z') });
  assert.equal((await target.reconcile(action)).status, 'succeeded');
  state.rawAttributes.brightness = 255; assert.equal((await target.reconcile(action)).status, 'outcome_unknown');
});

test("Home Assistant action target rejects a request for another site before calling the adapter", async () => {
  let called = false;
  const target = new HomeAssistantActionTarget({ adapter: { configuration: { siteRef: "home.one" }, callService: async () => { called = true; return { status: "acknowledged" }; }, getState: async () => null } });
  const result = await target.invoke({ siteRef: "home.two", executionEnvironmentRef: "live", operation: "light.set_level", targetEntityId: "light.kitchen_lights", parameters: { level: 0.4 } });
  assert.deepEqual(result, { status: "rejected", externalEffectOccurred: false, reasonCode: "target_site_mismatch" });
  assert.equal(called, false);
});

test('Home Assistant reconciliation rejects old, foreign, future or unavailable state without confirming an effect', async () => {
  const configuration = { siteRef: 'home.one', sourceRef: 'ha.one', baseUrl: 'http://synthetic.invalid' };
  const action = { siteRef: 'home.one', executionEnvironmentRef: 'live', operation: 'light.set_level', attemptRef: 'synthetic-attempt', startedAt: '2026-09-15T12:00:00Z', targetEntityId: 'light.synthetic', parameters: { level: 0.4 } };
  const base = { siteRef: 'home.one', sourceRef: 'ha.one', externalEntityId: 'light.synthetic', eventTime: '2026-09-15T12:00:01Z', value: 'on', rawAttributes: { brightness: 102 } };
  for (const change of [{ eventTime: '2026-09-15T11:59:59Z' }, { eventTime: '2026-09-15T12:00:03Z' }, { siteRef: 'other' }, { sourceRef: 'other' }, { externalEntityId: 'other' }, { value: 'unavailable' }]) {
    const target = new HomeAssistantActionTarget({ adapter: { configuration, getState: async () => ({ ...base, ...change }) }, clock: () => new Date('2026-09-15T12:00:02Z') });
    assert.equal((await target.reconcile(action)).status, 'outcome_unknown');
  }
  let reads = 0;
  const target = new HomeAssistantActionTarget({ adapter: { configuration, getState: async () => { reads++; return base; } } });
  assert.equal((await target.reconcile({ ...action, executionEnvironmentRef: 'replay' })).status, 'outcome_unknown');
  assert.equal((await target.reconcile({ ...action, attemptRef: null })).status, 'outcome_unknown'); assert.equal(reads, 0);
});

test('Home Assistant off state takes precedence over a retained previous brightness attribute', async () => {
  const target = new HomeAssistantActionTarget({ adapter: { configuration: { siteRef: 'home.one', sourceRef: 'ha.one', baseUrl: 'http://synthetic.invalid' }, getState: async () => ({ siteRef: 'home.one', sourceRef: 'ha.one', externalEntityId: 'light.synthetic', eventTime: '2026-09-15T12:00:01Z', value: 'off', rawAttributes: { brightness: 102 } }) }, clock: () => new Date('2026-09-15T12:00:02Z') });
  const result = await target.reconcile({ siteRef: 'home.one', executionEnvironmentRef: 'live', operation: 'light.set_level', attemptRef: 'synthetic-attempt', startedAt: '2026-09-15T12:00:00Z', targetEntityId: 'light.synthetic', parameters: { level: 0 } });
  assert.equal(result.status, 'succeeded'); assert.equal(result.observed.level, 0);
});
