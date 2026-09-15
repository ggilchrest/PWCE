import { randomUUID } from "node:crypto";
import { ensureEntity } from "./identity.js";
import { integrityValue } from "../contract-foundation/contract-foundation.js";
import { canonicalize } from "../contract-foundation/canonical-json.js";

const WORLD_ID = "018f0000-0000-7000-8000-000000000100";
const ENVIRONMENT_ID = "018f0000-0000-7000-8000-000000000300";
const PRODUCER_ID = "018f0000-0000-7000-8000-000000000204";

function timestamp(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function projectionKey(entityRef, property) {
  return `${entityRef}::${property}`;
}

function sameProjectionObservation(observation, entityRef, property) {
  return observation.payload.entityRef === entityRef && observation.payload.property === property;
}

function observationFingerprint({ siteRef, sourceRef, externalEntityId, property, value, eventTime, freshnessMs = null, quality = "nominal" }) {
  return canonicalize({ siteRef, sourceRef, externalEntityId, property, value, eventTime, freshnessMs, quality });
}

export async function ingestObservation(store, input, { now = () => new Date() } = {}) {
  const eventTime = timestamp(input.eventTime, "eventTime");
  const recordedAt = timestamp(now(), "recordedAt");
  if (!input.siteRef || !input.sourceRef || !input.externalEntityId || !input.property) throw new Error("siteRef, sourceRef, externalEntityId, and property are required");
  const outcome = await store.transaction((state) => {
    const source = state.sources[input.sourceRef];
    if (!source) throw new Error(`unknown source: ${input.sourceRef}`);
    if (source.siteRef !== input.siteRef) throw new Error("source site does not match observation site");
    const entity = ensureEntity(state, input);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const existingRecordId = state.idempotencyKeys[idempotencyKey];
    const existing = existingRecordId ? state.observations.find((observation) => observation.recordId === existingRecordId) : undefined;
    if (existing) {
      const existingFingerprint = observationFingerprint({ siteRef: existing.payload.siteRef, sourceRef: existing.sourceId, externalEntityId: existing.payload.entityRef.split("::").slice(1).join("::"), property: existing.payload.property, value: existing.payload.value, eventTime: existing.eventTime, freshnessMs: existing.payload.freshnessMs, quality: existing.payload.quality });
      const incomingFingerprint = observationFingerprint({ siteRef: input.siteRef, sourceRef: source.sourceRef, externalEntityId: input.externalEntityId, property: input.property, value: input.value, eventTime, freshnessMs: input.freshnessMs ?? null, quality: input.quality ?? "nominal" });
      if (existingFingerprint !== incomingFingerprint) { const error = new Error("observation idempotency key conflicts with different content"); error.code = "idempotency_conflict"; throw error; }
      return { observation: existing, projection: state.projections[projectionKey(entity.entityRef, input.property)], duplicate: true };
    }
    const observation = {
      recordId: randomUUID(),
      recordKind: "observation",
      worldId: WORLD_ID,
      schemaId: "pwce.observation.home-assistant-state",
      schemaVersion: "0.1.0",
      producerId: PRODUCER_ID,
      sourceId: source.sourceRef,
      recordedAt,
      eventTime,
      environment: { environmentId: ENVIRONMENT_ID, environmentClass: "test", executionMode: "normal" },
      correlationId: input.correlationId ?? randomUUID(),
      provenance: { producerId: PRODUCER_ID, processId: "pwce.observation.ingest", processVersion: "0.1.0", providerRef: source.providerRef ?? source.sourceKind, sourceRegistrationVersion: source.registrationVersion ?? "unknown", configurationVersion: source.configurationVersion ?? "unknown", inputRefs: [], authorityRefs: [], transformationRefs: [source.normalizationProfileRef ?? "pwce.normalize.home-assistant.v1"] },
      dataClassification: input.dataClassification ?? "private",
      retentionPolicyRef: "pwce.retention.default.v1",
      integrity: { schemeId: "sha256-jcs-v1", schemeVersion: "1.0.0", covers: "envelope_without_integrity_value", value: "pending" },
      payload: { siteRef: input.siteRef, entityRef: entity.entityRef, property: input.property, value: input.value, freshnessMs: input.freshnessMs ?? null, quality: input.quality ?? "nominal" }
    };
    observation.integrity.value = integrityValue(observation);
    state.observations.push(observation);
    state.idempotencyKeys[idempotencyKey] = observation.recordId;
    const key = projectionKey(entity.entityRef, input.property);
    const current = state.projections[key];
    const relevant = state.observations.filter((candidate) => sameProjectionObservation(candidate, entity.entityRef, input.property));
    const latestEventTime = relevant.reduce((latest, candidate) => candidate.eventTime > latest ? candidate.eventTime : latest, "");
    const latest = relevant.filter((candidate) => candidate.eventTime === latestEventTime);
    const values = new Map(latest.map((candidate) => [canonicalize(candidate.payload.value), candidate]));
    const selected = latest.at(-1);
    const conflicted = values.size > 1;
    state.projections[key] = { entityRef: entity.entityRef, siteRef: input.siteRef, property: input.property, value: selected.payload.value, eventTime: selected.eventTime, recordedAt: selected.recordedAt, sourceRef: selected.sourceId, observationRef: selected.recordId, freshnessMs: selected.payload.freshnessMs, quality: selected.payload.quality, knowledgeState: conflicted ? "conflicted" : "current", contradictions: conflicted ? [...values.values()].map((candidate) => ({ observationRef: candidate.recordId, sourceRef: candidate.sourceId, value: candidate.payload.value, eventTime: candidate.eventTime })) : [], revision: (current?.revision ?? 0) + 1 };
    state.audit.push({ type: "observation.accepted", recordId: observation.recordId, siteRef: input.siteRef, recordedAt });
    return { observation, projection: state.projections[key], duplicate: false };
  });
  return outcome.result;
}

export async function getCurrentAggregate(store, { siteRefs, externalEntityId, property, now = () => new Date() }) {
  if (!Array.isArray(siteRefs) || siteRefs.length < 2) throw new Error("aggregate current requires at least two sites");
  const uniqueSiteRefs = [...new Set(siteRefs)];
  const items = await Promise.all(uniqueSiteRefs.map((siteRef) => getCurrent(store, { siteRef, externalEntityId, property, now })));
  const conflicted = items.some((item) => item.status === "conflicted");
  const known = items.some((item) => item.status === "known");
  return { status: conflicted ? "conflicted" : known ? "known" : "unknown", knowledgeState: conflicted ? "conflicted" : known ? "current" : "unknown", siteRefs: uniqueSiteRefs, externalEntityId, property, items, limitations: ["Aggregate results remain site-qualified; values are not merged across sites."] };
}

// A read projection retains both what the sources agree on and how old their
// evidence is. These are separate dimensions: old disagreement is still a conflict.
export function qualifyProjection(projection, at) {
  const ageMs = Math.max(0, at.valueOf() - new Date(projection.eventTime).valueOf());
  const hasFreshnessTarget = Number.isFinite(projection.freshnessMs) && projection.freshnessMs >= 0;
  const freshnessState = !hasFreshnessTarget ? "unknown" : ageMs > projection.freshnessMs ? "stale" : "current";
  const conflicted = projection.knowledgeState === "conflicted";
  const knowledgeState = conflicted ? "conflicted" : freshnessState === "stale" ? "stale" : "current";
  const contradictions = (projection.contradictions ?? []).map(candidate => ({ ...candidate }));
  return {
    ...projection, status: knowledgeState === "current" ? "known" : knowledgeState,
    knowledgeState, basis: "observed", freshnessState, ageMs, contradictions,
    evidenceRefs: conflicted ? contradictions.map(candidate => candidate.observationRef) : [projection.observationRef],
    limitations: [
      ...(conflicted ? ["Multiple sources reported different values at the latest event time."] : []),
      ...(freshnessState === "stale" ? ["The latest accepted evidence is older than its declared freshness target."] : []),
      ...(freshnessState === "unknown" ? ["No freshness target is declared for this evidence."] : [])
    ]
  };
}

export async function getCurrent(store, { siteRef, externalEntityId, property, now = () => new Date() }) {
  const state = await store.load();
  const entityRef = `${siteRef}::${externalEntityId}`;
  const projection = state.projections[projectionKey(entityRef, property)];
  if (!projection) return { status: "unknown", reason: "no_accepted_observation", siteRef, entityRef, property };
  return qualifyProjection(projection, now());
}
