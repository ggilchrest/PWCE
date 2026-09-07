import { createHash } from "node:crypto";

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
  const relevant = sortByEventTime(state.observations.filter((observation) => matches(observation, input))).map((observation) => ({ recordId: observation.recordId, eventTime: observation.eventTime, value: observation.payload.value, quality: observation.payload.quality, sourceId: observation.sourceId }));
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

export async function queryHistory(store, input) {
  const state = await store.load();
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
  return { status: bounded.length ? "known" : "unknown", siteRef: input.siteRef, entityRef: entityRef(input.siteRef, input.externalEntityId), property: input.property, observations: observationsPage.map((observation) => ({ observationRef: observation.recordId, eventTime: observation.eventTime, recordedAt: observation.recordedAt, value: observation.payload.value, quality: observation.payload.quality, sourceRef: observation.sourceId })), hasMore, nextCursor: hasMore ? encodeCursor(key, offset + limit, revision) : null, limitations: hasMore ? ["History results are bounded by the requested limit; use nextCursor to continue within this source revision."] : [] };
}

export async function queryAsOf(store, input) {
  const history = await queryHistory(store, { ...input, to: input.asOf });
  const selected = history.observations.at(-1);
  if (!selected) return { status: "unknown", reason: "no_evidence_at_boundary", asOf: input.asOf, ...history };
  return { status: "known", asOf: input.asOf, selected, evidenceRefs: [selected.observationRef], ...history };
}

export async function explainCurrent(store, input, { now = () => new Date() } = {}) {
  const state = await store.load();
  const key = `${entityRef(input.siteRef, input.externalEntityId)}::${input.property}`;
  const projection = state.projections[key];
  if (!projection) return { status: "unknown", reason: "no_accepted_observation", limitations: ["No accepted Observation supports this query."] };
  const ageMs = Math.max(0, now().valueOf() - new Date(projection.eventTime).valueOf());
  const stale = projection.freshnessMs !== null && ageMs > projection.freshnessMs;
  const conflicted = projection.knowledgeState === "conflicted";
  const evidenceRefs = conflicted ? projection.contradictions.map((contradiction) => contradiction.observationRef) : [projection.observationRef];
  return { status: conflicted ? "conflicted" : stale ? "stale" : "known", knowledgeState: conflicted ? "conflicted" : stale ? "stale" : "current", value: projection.value, contradictions: projection.contradictions ?? [], siteRef: projection.siteRef, entityRef: projection.entityRef, property: projection.property, eventTime: projection.eventTime, freshnessMs: projection.freshnessMs, ageMs, sourceRef: projection.sourceRef, evidenceRefs, limitations: conflicted ? ["Multiple sources reported different values at the latest event time."] : stale ? ["The latest accepted evidence is older than its declared freshness target."] : [] };
}
