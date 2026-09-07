import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/runtime/state-store.js";
import { registerSite, registerSource } from "../src/domain/identity.js";
import { getCurrent, getCurrentAggregate, ingestObservation } from "../src/domain/observation-service.js";
import { queryHistory } from "../src/domain/query-service.js";
import { integrityValue } from "../src/contract-foundation/contract-foundation.js";
import { validateEnvelope } from "../src/contract-foundation/envelope-validator.js";
import { createStateBackup, restoreStateBackup } from "../src/runtime/recovery.js";

async function configuredStore(path) {
  const store = new StateStore({ path });
  await store.transaction((state) => {
    registerSite(state, { siteRef: "home.one", name: "Home One" });
    registerSource(state, { sourceRef: "ha.one", siteRef: "home.one", name: "Home Assistant One" });
  });
  return store;
}

test("registers site-qualified identities and persists them across reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-state-"));
  const path = join(directory, "state.json");
  await configuredStore(path);
  const reloaded = new StateStore({ path });
  const state = await reloaded.load();
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.sites["home.one"].name, "Home One");
  assert.throws(() => registerSite(state, { siteRef: "home.one" }), /already registered/);
});

test("creates an integrity-checked backup and restores it into an isolated state file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-backup-"));
  const sourcePath = join(directory, "state.json");
  const backupPath = join(directory, "backup.json");
  const restoredPath = join(directory, "isolated", "state.json");
  const store = await configuredStore(sourcePath);
  await createStateBackup(store, backupPath, { now: () => new Date("2026-09-07T12:00:00Z") });
  const restored = await restoreStateBackup(restoredPath, backupPath);
  assert.equal(restored.schemaVersion, 1);
  assert.equal(JSON.parse(await readFile(restoredPath, "utf8")).sites["home.one"].name, "Home One");
  const tamperedPath = join(directory, "tampered.json");
  await copyFile(backupPath, tamperedPath);
  const tampered = JSON.parse(await readFile(tamperedPath, "utf8"));
  tampered.state.worldRef = "world.tampered";
  await writeFile(tamperedPath, JSON.stringify(tampered));
  await assert.rejects(() => restoreStateBackup(join(directory, "rejected", "state.json"), tamperedPath), /integrity check failed/);
});

test("admits an observation, updates current state, and retains provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-observation-"));
  const store = await configuredStore(join(directory, "state.json"));
  const result = await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 21.5, eventTime: "2026-09-06T12:00:00Z", idempotencyKey: "event-001" }, { now: () => new Date("2026-09-06T12:00:01Z") });
  assert.equal(result.observation.payload.entityRef, "home.one::sensor.temperature");
  assert.equal(result.observation.integrity.value, integrityValue(result.observation));
  assert.deepEqual(validateEnvelope(result.observation), []);
  assert.equal(result.projection.value, 21.5);
  assert.equal((await getCurrent(store, { siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature" })).status, "known");
  const persisted = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.equal(persisted.observations.length, 1);
  assert.equal(persisted.audit[0].type, "observation.accepted");
});

test("retains out-of-order observations without regressing the current projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-order-"));
  const store = await configuredStore(join(directory, "state.json"));
  const common = { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature" };
  await ingestObservation(store, { ...common, value: 22, eventTime: "2026-09-06T12:00:05Z", idempotencyKey: "new" });
  await ingestObservation(store, { ...common, value: 20, eventTime: "2026-09-06T12:00:01Z", idempotencyKey: "late" });
  const state = await store.load();
  assert.equal(state.observations.length, 2);
  assert.equal(state.projections["home.one::sensor.temperature::temperature"].value, 22);
});

test("enforces source/site ownership and idempotent admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-safety-"));
  const store = await configuredStore(join(directory, "state.json"));
  await assert.rejects(() => ingestObservation(store, { siteRef: "home.two", sourceRef: "ha.one", externalEntityId: "light.kitchen", property: "state", value: "on", eventTime: "2026-09-06T12:00:00Z" }), /source site does not match/);
  const input = { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "light.kitchen", property: "state", value: "on", eventTime: "2026-09-06T12:00:00Z", idempotencyKey: "same" };
  const first = await ingestObservation(store, input);
  const second = await ingestObservation(store, input);
  assert.equal(second.duplicate, true);
  assert.equal(first.observation.recordId, second.observation.recordId);
  assert.equal((await store.load()).observations.length, 1);
  await assert.rejects(() => ingestObservation(store, { ...input, value: "off" }), (error) => error.code === "idempotency_conflict");
});

test("preserves same-time disagreement as a conflicted projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-conflict-"));
  const store = await configuredStore(join(directory, "state.json"));
  await store.transaction((state) => registerSource(state, { sourceRef: "ha.two", siteRef: "home.one", name: "Home Assistant Two" }));
  const common = { siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", eventTime: "2026-09-06T12:00:00Z" };
  await ingestObservation(store, { ...common, sourceRef: "ha.one", value: 21, idempotencyKey: "conflict-one" });
  await ingestObservation(store, { ...common, sourceRef: "ha.two", value: 18, idempotencyKey: "conflict-two" });
  const current = await getCurrent(store, common);
  assert.equal(current.status, "conflicted");
  assert.equal(current.knowledgeState, "conflicted");
  assert.equal(current.contradictions.length, 2);
});

test("aggregate current reads preserve one result per authorized site", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-aggregate-"));
  const store = await configuredStore(join(directory, "state.json"));
  await store.transaction((state) => { registerSite(state, { siteRef: "home.two", name: "Home Two" }); registerSource(state, { sourceRef: "ha.two", siteRef: "home.two" }); });
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 21, eventTime: "2026-09-07T12:00:00Z", idempotencyKey: "aggregate-one" });
  await ingestObservation(store, { siteRef: "home.two", sourceRef: "ha.two", externalEntityId: "sensor.temperature", property: "temperature", value: 18, eventTime: "2026-09-07T12:00:00Z", idempotencyKey: "aggregate-two" });
  const aggregate = await getCurrentAggregate(store, { siteRefs: ["home.one", "home.two"], externalEntityId: "sensor.temperature", property: "temperature" });
  assert.equal(aggregate.status, "known");
  assert.deepEqual(aggregate.items.map((item) => [item.siteRef, item.value]), [["home.one", 21], ["home.two", 18]]);
});

test("current state marks evidence stale after its freshness window", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-stale-"));
  const store = await configuredStore(join(directory, "state.json"));
  await ingestObservation(store, { siteRef: "home.one", sourceRef: "ha.one", externalEntityId: "sensor.temperature", property: "temperature", value: 21, eventTime: "2026-09-07T12:00:00Z", freshnessMs: 1_000, idempotencyKey: "stale-current" });
  const current = await getCurrent(store, { siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", now: () => new Date("2026-09-07T12:00:02Z") });
  assert.equal(current.status, "stale");
  assert.equal(current.knowledgeState, "stale");
});

test("history query rejects malformed bounds instead of silently widening the read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-query-bounds-"));
  const store = await configuredStore(join(directory, "state.json"));
  await assert.rejects(() => queryHistory(store, { siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", limit: 0 }), /query limit/);
  await assert.rejects(() => queryHistory(store, { siteRef: "home.one", externalEntityId: "sensor.temperature", property: "temperature", from: "not-a-time" }), /from must be a valid timestamp/);
});
