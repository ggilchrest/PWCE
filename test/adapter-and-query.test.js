import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/runtime/state-store.js";
import { registerSite, registerSource } from "../src/domain/identity.js";
import { HomeAssistantFixtureAdapter } from "../src/adapters/home-assistant-fixture.js";
import { getHealth } from "../src/runtime/health.js";
import { explainCurrent, queryAsOf, queryHistory } from "../src/domain/query-service.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "pwce-adapter-"));
  const store = new StateStore({ path: join(directory, "state.json") });
  await store.transaction((state) => {
    registerSite(state, { siteRef: "home.one", name: "Home One" });
    registerSource(state, { sourceRef: "ha.one", siteRef: "home.one" });
  });
  const adapter = new HomeAssistantFixtureAdapter({ store, siteRef: "home.one", sourceRef: "ha.one", now: () => new Date("2026-09-06T12:00:10Z") });
  return { store, adapter };
}

test("fixture adapter exposes online and offline source health", async () => {
  const { store, adapter } = await fixture();
  assert.equal((await getHealth(store)).status, "degraded");
  assert.equal((await getHealth(store)).unavailableSourceCount, 1);
  assert.equal((await adapter.connect()).status, "online");
  assert.equal((await getHealth(store)).status, "healthy");
  await adapter.disconnect("network_unavailable");
  const health = await getHealth(store);
  assert.equal(health.status, "degraded");
  assert.equal(health.sources[0].lastStatusReason, "network_unavailable");
  assert.ok(health.evaluatedAt);
  assert.ok(health.sources[0].statusChangedAt);
});

test("fixture adapter feeds normalized observations and preserves sequence metadata", async () => {
  const { store, adapter } = await fixture();
  await adapter.connect();
  const result = await adapter.emitState({ entityId: "sensor.temperature", property: "temperature", value: 21, eventTime: "2026-09-06T12:00:00Z", freshnessMs: 60000 });
  assert.equal(result.sequence, 1);
  assert.equal((await adapter.health()).lastSequence, 1);
  assert.equal((await store.load()).observations[0].payload.value, 21);
  assert.equal((await store.load()).observations[0].provenance.sourceRegistrationVersion, "1.0.0");
  assert.equal((await store.load()).observations[0].provenance.configurationVersion, "1.0.0");
  assert.equal((await store.load()).observations[0].provenance.transformationRefs[0], "pwce.normalize.home-assistant.v1");
});

test("history and as-of queries identify evidence without collapsing time", async () => {
  const { store, adapter } = await fixture();
  await adapter.connect();
  const common = { entityId: "sensor.temperature", property: "temperature" };
  await adapter.emitState({ ...common, value: 20, eventTime: "2026-09-06T12:00:00Z" });
  await adapter.emitState({ ...common, value: 22, eventTime: "2026-09-06T12:00:05Z" });
  const history = await queryHistory(store, { siteRef: "home.one", externalEntityId: common.entityId, property: common.property });
  assert.deepEqual(history.observations.map((item) => item.value), [20, 22]);
  const asOf = await queryAsOf(store, { siteRef: "home.one", externalEntityId: common.entityId, property: common.property, asOf: "2026-09-06T12:00:02Z" });
  assert.equal(asOf.selected.value, 20);
  assert.equal(asOf.evidenceRefs.length, 1);
});

test("explain distinguishes fresh evidence from stale evidence", async () => {
  const { store, adapter } = await fixture();
  await adapter.connect();
  await adapter.emitState({ entityId: "sensor.motion", property: "detected", value: true, eventTime: "2026-09-06T11:58:00Z", freshnessMs: 60000 });
  const explanation = await explainCurrent(store, { siteRef: "home.one", externalEntityId: "sensor.motion", property: "detected" }, { now: () => new Date("2026-09-06T12:00:10Z") });
  assert.equal(explanation.status, "stale");
  assert.equal(explanation.evidenceRefs.length, 1);
  assert.match(explanation.limitations[0], /freshness/);
});
