import { createHash } from "node:crypto";
import { canonicalize } from "../contract-foundation/canonical-json.js";
import { qualifyProjection } from "./observation-service.js";

function entityRef(siteRef, externalEntityId) {
  return `${siteRef}::${externalEntityId}`;
}

function matches(observation, { siteRef, externalEntityId, property }) {
  return observation.payload.siteRef === siteRef && observation.payload.entityRef === entityRef(siteRef, externalEntityId) && observation.payload.property === property;
}

function sortByEventTime(observations) {
  return [...observations].sort((left, right) => left.eventTime.localeCompare(right.eventTime));
}

function boundedLimit(value, fallback = 100) {
  const limit = value === undefined ? fallback : value;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("query limit must be an integer from 1 to 100");
  return limit;
}

function queryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeCursor(cursor, key, stateRevision) {
  if (cursor === undefined) return 0;
  if (typeof cursor !== "string" || cursor.length > 512) throw queryError("invalid_request", "query cursor is invalid");
  let decoded;
  try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw queryError("invalid_request", "query cursor is invalid"); }
  if (decoded?.version !== 1 || decoded.key !== key || !Number.isInteger(decoded.offset) || decoded.offset < 0) throw queryError("invalid_request", "query cursor does not match this query");
  if (decoded.sourceRevision !== stateRevision) throw queryError("cursor_stale", "query cursor is stale");
  return decoded.offset;
}

function sourceRevision(state, input) {
  const relevant = sortByEventTime(state.observations.filter((observation) => matches(observation, input))).map((observation) => ({ recordId: observation.recordId, eventTime: observation.eventTime, value: observation.payload.value, quality: observation.payload.quality, freshnessMs: observation.payload.freshnessMs, recordedAt: observation.recordedAt, sourceId: observation.sourceId }));
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}

function encodeCursor(key, offset, sourceRevision) {
  return Buffer.from(JSON.stringify({ version: 1, key, offset, sourceRevision })).toString("base64url");
}

function boundaryTime(value, label) {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function historyFromState(state, input) {
  const observations = sortByEventTime(state.observations.filter((observation) => matches(observation, input)));
  const from = boundaryTime(input.from, "from");
  const to = boundaryTime(input.to, "to");
  const bounded = observations.filter((observation) => (!from || observation.eventTime >= from) && (!to || observation.eventTime <= to));
  const limit = boundedLimit(input.limit);
  const key = `${input.siteRef}::${input.externalEntityId}::${input.property}::${from ?? ""}::${to ?? ""}`;
  const offset = decodeCursor(input.cursor, key, sourceRevision(state, input));
  const observationsPage = bounded.slice(offset, offset + limit);
  const hasMore = bounded.length > offset + limit;
  const revision = sourceRevision(state, input);
  const result = { status: bounded.length ? "known" : "unknown", siteRef: input.siteRef, entityRef: entityRef(input.siteRef, input.externalEntityId), property: input.property, sourceRevision: revision, observations: observationsPage.map(summarizeObservation), hasMore, nextCursor: hasMore ? encodeCursor(key, offset + limit, revision) : null, limitations: hasMore ? ["History results are bounded by the requested limit; use nextCursor to continue within this source revision."] : [] };
  return { result, bounded };
}

function summarizeObservation(observation) {
  return { observationRef: observation.recordId, eventTime: observation.eventTime, recordedAt: observation.recordedAt, value: observation.payload.value, quality: observation.payload.quality, sourceRef: observation.sourceId, freshnessMs: observation.payload.freshnessMs };
}

export async function queryHistory(store, input) {
  return historyFromState(await store.load(), input).result;
}

export async function queryAsOf(store, input) {
  const asOf = boundaryTime(input.asOf, "asOf");
  if (!asOf) throw queryError("invalid_request", "asOf is required");
  // Choose from the complete time-bounded snapshot. Pagination only limits the
  // accompanying history page; it must never move the selected point in time.
  const { result: history, bounded } = historyFromState(await store.load(), { ...input, to: asOf });
  const selected = bounded.at(-1);
  if (!selected) return { ...history, status: "unknown", knowledgeState: "unknown", basis: null, reason: "no_evidence_at_boundary", asOf };
  const latest = bounded.filter(observation => observation.eventTime === selected.eventTime);
  const values = new Map(latest.map(observation => [canonicalize(observation.payload.value), observation]));
  const contradictions = values.size > 1 ? [...values.values()].map(summarizeObservation) : [];
  const qualified = qualifyProjection({ ...summarizeObservation(selected), knowledgeState: values.size > 1 ? "conflicted" : "current", contradictions }, new Date(asOf));
  const boundary = { ...history, status: qualified.status, knowledgeState: qualified.knowledgeState, basis: "observed", asOf,
    eventTime: selected.eventTime, freshnessMs: qualified.freshnessMs, freshnessState: qualified.freshnessState, ageMs: qualified.ageMs,
    evidenceRefs: qualified.evidenceRefs, limitations: [...history.limitations, ...qualified.limitations] };
  if (values.size > 1) return { ...boundary, contradictions, limitations: [...boundary.limitations, "No single value is selected at this historical boundary."] };
  return { ...boundary, selected: summarizeObservation(selected) };
}

export async function explainCurrent(store, input, { now = () => new Date() } = {}) {
  const state = await store.load();
  const key = `${entityRef(input.siteRef, input.externalEntityId)}::${input.property}`;
  const projection = state.projections[key];
  if (!projection) return { status: "unknown", sourceRevision: sourceRevision(state, input), reason: "no_accepted_observation", limitations: ["No accepted Observation supports this query."] };
  return { ...qualifyProjection(projection, now()), sourceRevision: sourceRevision(state, input) };
}
