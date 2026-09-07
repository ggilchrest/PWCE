import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { assertRef } from "../domain/identity.js";
import { explainCurrent, queryAsOf, queryHistory } from "../domain/query-service.js";
import { getHealth } from "../runtime/health.js";

const PROFILE_ID = "pwce-agent-gateway.v1";
const PROFILE_VERSION = "1.0.0";
const operationCatalog = Object.freeze([
  { operation: "context.getPreparedInputs", kind: "query", availability: "active" },
  { operation: "context.query", kind: "query", availability: "active" },
  { operation: "evidence.get", kind: "query", availability: "active" },
  { operation: "events.subscribe", kind: "stream", availability: "development" },
  { operation: "authority.evaluate", kind: "authority", availability: "active" },
  { operation: "authority.authorizeDispatch", kind: "authority", availability: "trusted_dispatch_only" },
  { operation: "authority.getGrants", kind: "authority", availability: "active" },
  { operation: "capabilities.getSnapshot", kind: "query", availability: "active" },
  { operation: "capabilities.invoke", kind: "effect", availability: "action_service_required" },
  { operation: "capabilities.getInvocation", kind: "query", availability: "action_service_required" },
  { operation: "trace.publish", kind: "trace", availability: "development" },
  { operation: "health.get", kind: "query", availability: "active" }
]);
const catalogDigest = createHash("sha256").update(JSON.stringify(operationCatalog)).digest("hex");
const executionModes = new Set(["normal", "live", "test", "replay", "simulation", "dry-run"]);

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function equalDigest(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function materialSourceRevision(state) {
  return createHash("sha256").update(JSON.stringify({ sites: state.sites, sources: state.sources, entities: state.entities, observations: state.observations, projections: state.projections })).digest("hex");
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requestIdentity(value, label) {
  if (value === undefined) return randomUUID();
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw fail("invalid_request", `${label} must be a bounded string`);
  return value;
}

function optionalIdentity(value, label) {
  return value === undefined || value === null ? null : requestIdentity(value, label);
}

function identityList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 32) throw fail("invalid_request", "participantRefs must be a bounded list");
  return [...new Set(value.map((item) => requestIdentity(item, "participantRef")))];
}

function sameIdentityList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class GatewayService {
  #store;
  #actionService;
  #clock;
  #principals = new Map();
  #contexts = new Map();
  #events = [];
  #eventSequence = 0;
  #eventListeners = new Set();
  #eventRetention;
  #unsubscribe = null;
  #eventReady;
  #eventPersistenceQueue = Promise.resolve();

  constructor({ store, actionService = null, clock = () => new Date(), eventRetention = 500 }) {
    this.#store = store;
    this.#actionService = actionService;
    this.#actionService?.setGrantChangeListener?.((change) => this.#onGrantChanged(change));
    if (!Number.isInteger(eventRetention) || eventRetention < 1 || eventRetention > 10_000) throw fail("invalid_request", "event retention outside allowed range");
    this.#eventRetention = eventRetention;
    this.#clock = clock;
    this.#eventReady = this.#restoreEvents();
    this.#unsubscribe = store.subscribe?.((state, result, previousState) => this.#observeState(state, result, previousState)) ?? null;
  }

  registerPrincipal({ principalRef, token, siteRefs = [] }) {
    assertRef(principalRef, "principalRef");
    if (typeof token !== "string" || token.length < 16) throw new Error("token must be a bounded secret");
    if (!Array.isArray(siteRefs) || siteRefs.some((siteRef) => { try { assertRef(siteRef, "siteRef"); return false; } catch { return true; } })) throw new Error("siteRefs must be scoped references");
    const revision = (this.#principals.get(principalRef)?.revision ?? 0) + 1;
    this.#principals.set(principalRef, { principalRef, tokenDigest: digest(token), siteRefs: new Set(siteRefs), revision });
    for (const context of this.#contexts.values()) if (context.principalRef === principalRef) this.#publishEvent({ type: "authority.invalidated", principalRef, siteRef: null, affectedRef: principalRef, reason: "principal_revision_changed", sourceRevision: revision });
    return { principalRef, siteRefs: [...siteRefs] };
  }

  issueAuthorityContext({ principalRef, token, siteRefs, ttlMs = 300_000, assistantRef, endpointRef, participantRefs, audienceRef }) {
    const principal = this.#principals.get(principalRef);
    if (typeof token !== "string" || !principal || !equalDigest(principal.tokenDigest, digest(token))) throw fail("authentication_failed", "authentication failed");
    if (!Array.isArray(siteRefs) || siteRefs.length === 0 || siteRefs.some((siteRef) => !principal.siteRefs.has(siteRef))) throw fail("authority_scope_denied", "requested authority exceeds principal scope");
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 3_600_000) throw fail("invalid_request", "ttlMs outside allowed range");
    const context = { authorityContextRef: randomUUID(), principalRef, principalRevision: principal.revision, grantRevision: this.#actionService?.getGrant(principalRef).revision ?? null, siteRefs: [...new Set(siteRefs)], assistantRef: optionalIdentity(assistantRef, "assistantRef"), endpointRef: optionalIdentity(endpointRef, "endpointRef"), participantRefs: identityList(participantRefs), audienceRef: optionalIdentity(audienceRef, "audienceRef"), expiresAt: new Date(this.#clock().valueOf() + ttlMs).toISOString() };
    this.#contexts.set(context.authorityContextRef, context);
    return { authorityContextRef: context.authorityContextRef, expiresAt: context.expiresAt, siteRefs: context.siteRefs };
  }

  authenticateAuthorityContext({ token, authorityContextRef }) {
    const context = this.#contexts.get(authorityContextRef);
    const principal = context ? this.#principals.get(context.principalRef) : null;
    if (typeof token !== "string" || !context || !principal || !equalDigest(principal.tokenDigest, digest(token))) throw fail("authentication_failed", "authentication failed");
    if (new Date(context.expiresAt) <= this.#clock()) throw fail("authority_context_expired", "authority context expired or unknown");
    if (context.principalRevision !== principal.revision) throw fail("authority_context_invalidated", "authority context invalidated");
    return { ...context, siteRefs: [...context.siteRefs], participantRefs: [...context.participantRefs] };
  }

  async requestAuthenticated({ token, ...request }) {
    this.authenticateAuthorityContext({ token, authorityContextRef: request.authorityContextRef });
    return this.request(request);
  }

  async request({ profileId = PROFILE_ID, profileVersion = PROFILE_VERSION, operation, authorityContextRef, requestId, correlationId, worldRef, executionEnvironmentRef = "normal", deadline, assistantRef, endpointRef, participantRefs, audienceRef, ...input }) {
    await this.#eventReady;
    if (profileId !== PROFILE_ID || profileVersion !== PROFILE_VERSION) throw fail("incompatible_gateway_profile", "incompatible gateway profile");
    const state = await this.#store.load();
    const requestContext = { requestId: requestIdentity(requestId, "requestId"), correlationId: requestIdentity(correlationId, "correlationId"), worldRef: worldRef ?? state.worldRef, executionEnvironmentRef };
    if (typeof requestContext.worldRef !== "string" || requestContext.worldRef.length < 1 || requestContext.worldRef.length > 128) throw fail("invalid_request", "worldRef must be a bounded string");
    if (requestContext.worldRef !== state.worldRef) throw fail("scope_denied", "world is outside the gateway boundary");
    if (!executionModes.has(executionEnvironmentRef)) throw fail("invalid_request", "executionEnvironmentRef is unsupported");
    if (deadline !== undefined && (typeof deadline !== "string" || Number.isNaN(new Date(deadline).valueOf()))) throw fail("invalid_request", "deadline must be a valid timestamp");
    if (deadline !== undefined && new Date(deadline) <= this.#clock()) throw fail("deadline_exceeded", "gateway request deadline has expired");
    const context = this.#contexts.get(authorityContextRef);
    if (!context || new Date(context.expiresAt) <= this.#clock()) throw fail("authority_context_expired", "authority context expired or unknown");
    if (optionalIdentity(assistantRef, "assistantRef") !== context.assistantRef || optionalIdentity(endpointRef, "endpointRef") !== context.endpointRef || optionalIdentity(audienceRef, "audienceRef") !== context.audienceRef || !sameIdentityList(identityList(participantRefs), context.participantRefs)) throw fail("scope_denied", "request identity is outside authority context");
    const principal = context ? this.#principals.get(context.principalRef) : null;
    if (!principal || context.principalRevision !== principal.revision) throw fail("authority_context_invalidated", "authority context invalidated");
    if (context.grantRevision !== (this.#actionService?.getGrant(context.principalRef).revision ?? null)) throw fail("authority_context_invalidated", "authority context invalidated");
    if (input.siteRef && !context.siteRefs.includes(input.siteRef)) throw fail("scope_denied", "site is outside authority context");
    const metadata = { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, ...requestContext };
    await this.#audit("gateway.request", { principalRef: context.principalRef, operation, siteRef: input.siteRef ?? null, ...requestContext });
    if (operation === "health.get") return { ...metadata, ...(await getHealth(this.#store, { now: this.#clock })) };
    if (operation === "context.getPreparedInputs") return this.#boundedPreparedResponse(input, { ...metadata, ...(await this.#preparedInputs(context, input)) });
    if (operation === "context.query") return this.#boundedQueryResponse(input, { ...metadata, ...(await this.#query(context, input)) });
    if (operation === "evidence.get") return { ...metadata, ...(await this.#evidence(context, input)) };
    if (operation === "authority.getGrants") return { ...metadata, ...(await this.#grants(context)) };
    if (operation === "authority.evaluate") return { ...metadata, ...(await this.#evaluate(context, { ...input, ...requestContext })) };
    if (operation === "events.subscribe") return { ...metadata, ...(await this.#subscribeEvents(context, input)) };
    if (operation === "trace.publish") return { ...metadata, ...(await this.#publishTrace(context, { ...input, ...requestContext })) };
    if (operation === "authority.authorizeDispatch") throw fail("trusted_dispatch_only", "authority.authorizeDispatch is restricted to the trusted dispatch path");
    if (operation === "capabilities.getSnapshot") return { ...metadata, ...this.#capabilitySnapshot(context) };
    if (operation === "capabilities.invoke") return { ...metadata, ...(await this.#invokeCapability(context, { ...input, ...requestContext })) };
    if (operation === "capabilities.getInvocation") return { ...metadata, ...(await this.#getInvocation(context, input)) };
    throw fail("unsupported_operation", `unsupported gateway operation: ${operation}`);
  }

  async #query(context, input) {
    const { mode, siteRef, externalEntityId, property } = input;
    const detail = input.detail ?? "standard";
    if (!["summary", "standard", "evidence"].includes(detail)) throw fail("invalid_request", "context.query detail must be summary, standard, or evidence");
    if (input.maxBytes !== undefined && (!Number.isInteger(input.maxBytes) || input.maxBytes < 256 || input.maxBytes > 262144)) throw fail("invalid_request", "context.query maxBytes must be an integer from 256 to 262144");
    if (input.maxAgeMs !== undefined && (!Number.isInteger(input.maxAgeMs) || input.maxAgeMs < 0 || input.maxAgeMs > 2_592_000_000)) throw fail("invalid_request", "context.query maxAgeMs must be an integer from 0 to 2592000000");
    if (input.allowStale !== undefined && typeof input.allowStale !== "boolean") throw fail("invalid_request", "context.query allowStale must be boolean");
    const siteRefs = Array.isArray(input.siteRefs) ? [...new Set(input.siteRefs)] : siteRef ? [siteRef] : [];
    if (!mode || !siteRefs.length) throw fail("invalid_request", "context.query requires mode and site scope");
    if (siteRefs.length > 1 && siteRef !== undefined) throw fail("invalid_request", "context.query uses siteRefs instead of siteRef for multi-site queries");
    if (siteRefs.length > 1 && mode !== "current") throw fail("invalid_request", "multi-site queries currently support current mode only");
    if (siteRefs.some((requestedSiteRef) => !context.siteRefs.includes(requestedSiteRef))) throw fail("scope_denied", "site is outside authority context");
    if (mode !== "search" && (!externalEntityId || !property)) throw fail("invalid_request", "context.query requires externalEntityId and property for this mode");
    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) throw fail("invalid_request", "context.query limit outside allowed range");
    if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length > 512)) throw fail("invalid_request", "context.query cursor outside allowed range");
    if (mode === "current" || mode === "explain") {
      if (mode === "current") return siteRefs.length > 1 ? this.#aggregateCurrent(context, { ...input, siteRefs }) : this.#current(context, input);
      return this.#decorateSlice(context, input, await explainCurrent(this.#store, input, { now: this.#clock }));
    }
    if (mode === "history") return this.#decorateSlice(context, input, await queryHistory(this.#store, input));
    if (mode === "asOf") {
      if (!input.asOf) throw fail("invalid_request", "asOf mode requires asOf");
      return this.#decorateSlice(context, input, await queryAsOf(this.#store, input));
    }
    if (mode === "search") {
      const state = await this.#store.load();
      const text = String(input.text ?? "");
      if (text.length > 256) throw fail("invalid_request", "context.query search text exceeds 256 characters");
      const limit = input.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("invalid_request", "context.query search limit outside allowed range");
      const needle = text.toLowerCase();
      const allowed = new Set(siteRefs);
      const matches = Object.values(state.entities).filter((entity) => allowed.has(entity.siteRef) && (entity.entityRef.toLowerCase().includes(needle) || String(entity.displayName ?? "").toLowerCase().includes(needle))).slice(0, limit).map((entity) => ({ entityRef: entity.entityRef, siteRef: entity.siteRef, displayName: entity.displayName }));
      return this.#decorateSlice(context, input, { status: matches.length ? "known" : "unknown", query: text, matches, limitations: matches.length === limit ? ["Search results are bounded by the requested limit."] : [] });
    }
    throw fail("unsupported_operation", `unsupported context query mode: ${mode}`);
  }

  #boundedQueryResponse(input, result) {
    const response = this.#applyFreshnessPolicy(input, { ...result, detail: input.detail ?? "standard" });
    if (input.maxBytes !== undefined && Buffer.byteLength(JSON.stringify(response), "utf8") > input.maxBytes) throw fail("limit_exceeded", "context.query response exceeds maxBytes");
    return response;
  }

  #applyFreshnessPolicy(input, result) {
    if (input.maxAgeMs === undefined || !["current", "explain"].includes(input.mode)) return result;
    const allowStale = input.allowStale === true;
    const qualify = (item) => {
      if (!item?.eventTime) return item;
      const ageMs = Math.max(0, this.#clock().valueOf() - new Date(item.eventTime).valueOf());
      if (ageMs <= input.maxAgeMs) return { ...item, freshnessAccepted: true };
      const qualified = { ...item, status: "stale", knowledgeState: "stale", freshnessAccepted: false, limitations: [...(item.limitations ?? []), "The evidence exceeds the caller's maximum acceptable age."] };
      if (!allowStale) { delete qualified.value; qualified.reason = "maximum_age_exceeded"; }
      return qualified;
    };
    if (Array.isArray(result.items)) {
      const items = result.items.map(qualify);
      return { ...result, items, freshnessAccepted: items.every((item) => item.freshnessAccepted !== false), limitations: [...(result.limitations ?? []), ...(items.some((item) => item.freshnessAccepted === false) ? [allowStale ? "One or more items are stale under the caller's maximum acceptable age." : "One or more items exceed the caller's maximum acceptable age and their values were withheld."] : [])] };
    }
    return qualify(result);
  }

  async #aggregateCurrent(context, { siteRefs, externalEntityId, property }) {
    const state = await this.#store.load();
    const items = siteRefs.map((requestedSiteRef) => {
      const projection = state.projections[`${requestedSiteRef}::${externalEntityId}::${property}`];
      if (!projection) return { status: "unknown", knowledgeState: "unknown", siteRef: requestedSiteRef, entityRef: `${requestedSiteRef}::${externalEntityId}`, property, evidenceRefs: [], limitations: ["No accepted observation supports this site query."] };
      const conflicted = projection.knowledgeState === "conflicted";
      const stale = !conflicted && projection.freshnessMs !== null && Math.max(0, this.#clock().valueOf() - new Date(projection.eventTime).valueOf()) > projection.freshnessMs;
      return { siteRef: requestedSiteRef, ...projection, status: conflicted ? "conflicted" : stale ? "stale" : "known", knowledgeState: conflicted ? "conflicted" : stale ? "stale" : "current", evidenceRefs: conflicted ? projection.contradictions.map((contradiction) => contradiction.observationRef) : [projection.observationRef], limitations: conflicted ? ["Multiple sources reported different values at the latest event time."] : stale ? ["The latest accepted evidence is older than its declared freshness target."] : [] };
    });
    const known = items.some((item) => item.status === "known");
    const conflicted = items.some((item) => item.status === "conflicted");
    return { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, sliceRef: randomUUID(), worldRef: state.worldRef, sourceRevision: materialSourceRevision(state), evaluatedAt: this.#clock().toISOString(), siteRefs, externalEntityId, property, status: conflicted ? "conflicted" : known ? "known" : "unknown", knowledgeState: conflicted ? "conflicted" : known ? "current" : "unknown", basis: known || conflicted ? "observed" : null, items, invalidationCursor: String(this.#eventSequence), limitations: ["Multi-site current results remain site-qualified; values are not merged across sites."] };
  }

  async #current(context, input) {
    if (!context.siteRefs.includes(input.siteRef)) throw fail("scope_denied", "site is outside authority context");
    const state = await this.#store.load();
    const key = `${input.siteRef}::${input.externalEntityId}::${input.property}`;
    const projection = state.projections[key];
    const base = { sliceRef: randomUUID(), worldRef: state.worldRef, sourceRevision: materialSourceRevision(state), evaluatedAt: this.#clock().toISOString(), siteRef: input.siteRef, invalidationCursor: String(this.#eventSequence), limitations: [] };
    if (!projection) return { ...base, status: "unknown", knowledgeState: "unknown", basis: null, reason: "no_accepted_observation", entityRef: `${input.siteRef}::${input.externalEntityId}`, property: input.property };
    const conflicted = projection.knowledgeState === "conflicted";
    const evidenceRefs = conflicted ? projection.contradictions.map((contradiction) => contradiction.observationRef) : [projection.observationRef];
    const stale = !conflicted && projection.freshnessMs !== null && Math.max(0, this.#clock().valueOf() - new Date(projection.eventTime).valueOf()) > projection.freshnessMs;
    return { ...base, basis: "observed", ...projection, status: conflicted ? "conflicted" : stale ? "stale" : "known", knowledgeState: conflicted ? "conflicted" : stale ? "stale" : "current", evidenceRefs, limitations: conflicted ? ["Multiple sources reported different values at the latest event time."] : stale ? ["The latest accepted evidence is older than its declared freshness target."] : [] };
  }

  async #decorateSlice(context, input, result) {
    const state = await this.#store.load();
    const status = result.status;
    return {
      ...result,
      sliceRef: randomUUID(),
      worldRef: state.worldRef,
      sourceRevision: state.revision,
      evaluatedAt: this.#clock().toISOString(),
      siteRef: input.siteRef,
      invalidationCursor: String(this.#eventSequence),
      knowledgeState: result.knowledgeState ?? (status === "stale" ? "stale" : status === "known" ? "current" : "unknown"),
      basis: result.basis ?? (status === "known" || status === "stale" ? "observed" : null),
      limitations: result.limitations ?? []
    };
  }

  async #preparedInputs(context, { siteRef, limit = 50, maxBytes } = {}) {
    if (!siteRef) throw fail("invalid_request", "context.getPreparedInputs requires siteRef");
    if (!context.siteRefs.includes(siteRef)) throw fail("scope_denied", "site is outside authority context");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("invalid_request", "prepared input limit outside allowed range");
    if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 256 || maxBytes > 262144)) throw fail("invalid_request", "prepared input maxBytes must be an integer from 256 to 262144");
    const state = await this.#store.load();
    const allInputs = Object.values(state.projections).filter((projection) => projection.siteRef === siteRef).map((projection) => ({
      entityRef: projection.entityRef,
      property: projection.property,
      value: projection.value,
      eventTime: projection.eventTime,
      sourceRef: projection.sourceRef,
      evidenceRefs: [projection.observationRef],
      quality: projection.quality,
      freshnessMs: projection.freshnessMs
    }));
    const inputs = allInputs.slice(0, limit);
    const sources = Object.values(state.sources).filter((source) => source.siteRef === siteRef).map((source) => ({ sourceRef: source.sourceRef, status: source.status, lastStatusReason: source.lastStatusReason ?? null, lastEventTime: source.lastEventTime ?? null }));
    return { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, worldRef: state.worldRef, siteRef, revision: materialSourceRevision(state), knowledgeState: inputs.length ? "known" : "unknown", inputs, sources, hasMore: allInputs.length > limit, limitations: ["Prepared inputs are bounded current projections; they are not a complete prompt or conversation context.", ...(allInputs.length > limit ? ["Prepared inputs were truncated at the requested limit."] : [])] };
  }

  #boundedPreparedResponse(input, result) {
    if (input.maxBytes !== undefined && Buffer.byteLength(JSON.stringify(result), "utf8") > input.maxBytes) throw fail("limit_exceeded", "prepared input response exceeds maxBytes");
    return result;
  }

  async #grants(context) {
    const state = await this.#store.load();
    const grant = this.#actionService?.getGrant(context.principalRef);
    const siteRefs = grant ? grant.siteRefs.filter((siteRef) => context.siteRefs.includes(siteRef)) : [...context.siteRefs];
    const capabilityRefs = grant?.capabilityRefs ?? [];
    return { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, principalRef: context.principalRef, siteRefs, capabilityRefs, sourceRevision: materialSourceRevision(state), limitations: capabilityRefs.length ? [] : ["No effect capability grant is activated in the current gateway tier."] };
  }

  #capabilitySnapshot(context) {
    const snapshot = this.#actionService?.snapshot();
    const issuedAt = this.#clock().toISOString();
    const grantRevision = context.grantRevision ?? 0;
    return { snapshotRef: randomUUID(), profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, principalRef: context.principalRef, siteRefs: [...context.siteRefs], sourceRevision: grantRevision, issuedAt, expiresAt: context.expiresAt, invalidationSequence: grantRevision, capabilities: snapshot?.capabilities ?? [], availability: snapshot ? "configured" : "none", limitations: snapshot ? [] : ["No effect capability is activated in the current development tier."] };
  }

  #actionRequest(context, input) {
    const executionEnvironmentRef = input.executionEnvironmentRef ?? "test";
    return { principalRef: context.principalRef, capabilityRef: input.capabilityRef, operation: input.capabilityOperation ?? input.operation, siteRef: input.siteRef, targetEntityId: input.targetEntityId, parameters: input.parameters, executionEnvironmentRef, idempotencyKey: input.idempotencyKey, approvalRequired: executionEnvironmentRef === "live" ? true : (input.approvalRequired ?? true), approvalRef: input.approvalRef };
  }

  #evaluate(context, input = {}) {
    if (!this.#actionService) return {
      profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, outcome: "denied", capabilityRef: input.capabilityRef ?? null, siteRef: input.siteRef ?? null, rationaleCodes: ["effect_capabilities_not_activated"], requirements: [], limitations: ["No gateway effect capability is activated in the current development tier."]
    };
    const request = this.#actionRequest(context, input);
    const decision = this.#actionService.preview(request);
    return {
      profileId: PROFILE_ID,
      profileVersion: PROFILE_VERSION,
      ...decision,
      requirements: decision.outcome === "approval_required" ? ["runtime_human_approval"] : [],
      limitations: []
    };
  }

  async #invokeCapability(context, input = {}) {
    if (!this.#actionService) return { status: "denied", outcome: "denied", rationaleCodes: ["effect_capabilities_not_activated"] };
    if (!input.idempotencyKey) throw fail("invalid_request", "capabilities.invoke requires idempotencyKey");
    const request = this.#actionRequest(context, input);
    const admitted = await this.#actionService.authorizeDispatch(request);
    if (!admitted.action) return { status: "denied", ...admitted.decision };
    const action = await this.#actionService.dispatch(admitted.action.actionRef);
    const result = action.result ?? action;
    return { status: action.status === "succeeded" ? "completed" : action.status, actionRef: admitted.action.actionRef, decision: admitted.decision, result };
  }

  async #getInvocation(context, { actionRef } = {}) {
    if (!this.#actionService || !actionRef) return { status: "unknown", reason: "invocation_not_available" };
    const action = await this.#actionService.getInvocation(actionRef);
    if (!action || !context.siteRefs.includes(action.siteRef) || action.principalRef !== context.principalRef) return { status: "unknown", reason: "invocation_not_found" };
    return { status: "known", action };
  }

  #observeState(state, result, previousState) {
    const observation = result?.observation?.recordId ? state.observations.find((candidate) => candidate.recordId === result.observation.recordId) : null;
    if (observation) this.#publishEvent({ type: "context.invalidated", siteRef: observation.payload.siteRef, affectedRef: observation.payload.entityRef, reason: "observation_accepted", sourceRevision: state.revision });
    for (const source of Object.values(state.sources)) {
      const previous = previousState?.sources?.[source.sourceRef];
      if (previous && previous.status !== source.status && (source.status === "degraded" || source.status === "offline")) this.#publishEvent({ type: "provider.degraded", siteRef: source.siteRef, affectedRef: source.sourceRef, reason: source.lastStatusReason ?? source.status, sourceRevision: state.revision });
    }
    const priorAuditLength = previousState?.audit?.length ?? 0;
    for (const audit of state.audit.slice(priorAuditLength)) {
      if (audit.type !== "action.admitted" && audit.type !== "action.result" && audit.type !== "action.reconciled") continue;
      const action = state.actions[audit.actionRef];
      if (action) this.#publishEvent({ type: "action.updated", siteRef: action.siteRef, affectedRef: action.actionRef, reason: audit.type, sourceRevision: state.revision });
    }
  }

  #publishEvent({ type, principalRef = null, siteRef, affectedRef = null, reason, sourceRevision }) {
    const event = { eventId: randomUUID(), type, cursor: String(++this.#eventSequence), sourceRevision, affectedRef, watch: (siteRef || principalRef) ? { siteRefs: siteRef ? [siteRef] : [], principalRefs: principalRef ? [principalRef] : [] } : null, reason, occurredAt: this.#clock().toISOString(), correlationId: randomUUID() };
    this.#events.push(event);
    if (this.#events.length > this.#eventRetention) this.#events.shift();
    this.#eventPersistenceQueue = this.#eventPersistenceQueue.then(async () => {
      await this.#eventReady;
      await this.#store.transaction((state) => {
        if (!state.audit.some((entry) => entry.type === "gateway.event" && entry.event?.eventId === event.eventId)) state.audit.push({ type: "gateway.event", event, recordedAt: this.#clock().toISOString() });
      });
    }).catch(() => undefined);
    for (const listener of this.#eventListeners) {
      if ((listener.siteRef === siteRef || listener.principalRef === principalRef) && Number(event.cursor) > listener.afterCursor) {
        listener.afterCursor = Number(event.cursor);
        try { listener.onEvent(event); } catch { /* A disconnected stream must not affect state admission. */ }
      }
    }
  }

  openEventStream({ siteRef, principalRef = null, afterCursor = "0", onEvent }) {
    const cursor = Number(afterCursor);
    if (!siteRef || !Number.isInteger(cursor) || cursor < 0 || typeof onEvent !== "function") throw fail("invalid_request", "event stream parameters are invalid");
    const listener = { siteRef, principalRef, afterCursor: cursor, onEvent };
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  close() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#eventListeners.clear();
  }

  #onGrantChanged({ principalRef, revision }) {
    for (const context of this.#contexts.values()) if (context.principalRef === principalRef) {
      this.#publishEvent({ type: "authority.invalidated", principalRef, siteRef: null, affectedRef: principalRef, reason: "grant_revision_changed", sourceRevision: revision });
      this.#publishEvent({ type: "capabilities.invalidated", principalRef, siteRef: null, affectedRef: principalRef, reason: "grant_revision_changed", sourceRevision: revision });
    }
  }

  async #subscribeEvents(context, { siteRef, afterCursor = "0", limit = 100 } = {}) {
    await this.#eventPersistenceQueue;
    if (!siteRef) throw fail("invalid_request", "events.subscribe requires siteRef");
    if (!context.siteRefs.includes(siteRef)) throw fail("scope_denied", "site is outside authority context");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("invalid_request", "events.subscribe limit outside allowed range");
    const cursor = Number(afterCursor);
    if (!Number.isInteger(cursor) || cursor < 0) throw fail("invalid_request", "events.subscribe afterCursor must be a non-negative integer");
    const earliest = this.#events.length ? Number(this.#events[0].cursor) : this.#eventSequence + 1;
    const resyncRequired = cursor < earliest - 1;
    const matching = resyncRequired ? [] : this.#events.filter((event) => Number(event.cursor) > cursor && (event.watch?.siteRefs.includes(siteRef) || event.watch?.principalRefs.includes(context.principalRef)));
    const events = matching.slice(0, limit);
    const nextCursor = events.length === limit ? events.at(-1).cursor : String(Math.max(cursor, this.#eventSequence));
    return { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, principalRef: context.principalRef, siteRef, events, nextCursor, resyncRequired, limitations: ["This development binding carries bounded invalidation replay; it does not expose the unrestricted event bus."] };
  }

  async #publishTrace(context, { traceNamespace, events, requestId, correlationId, worldRef, executionEnvironmentRef } = {}) {
    if (typeof traceNamespace !== "string" || !/^lifestream\.[a-z0-9._-]+$/.test(traceNamespace)) throw fail("invalid_request", "traceNamespace must be a bounded lifestream namespace");
    if (!Array.isArray(events) || events.length < 1 || events.length > 100) throw fail("invalid_request", "trace.publish requires between 1 and 100 events");
    if (events.some((event) => !event || typeof event !== "object" || Array.isArray(event))) throw fail("invalid_request", "trace events must be objects");
    const encoded = JSON.stringify(events);
    if (Buffer.byteLength(encoded, "utf8") > 64 * 1024) throw fail("invalid_request", "trace batch exceeds the 64 KiB development limit");
    const traceBatchRef = randomUUID();
    await this.#store.transaction((state) => state.audit.push({ type: "gateway.trace", traceBatchRef, principalRef: context.principalRef, siteRefs: [...context.siteRefs], traceNamespace, requestId, correlationId, worldRef, executionEnvironmentRef, events: structuredClone(events), recordedAt: this.#clock().toISOString() }));
    return { traceBatchRef, traceNamespace, acceptedEventCount: events.length, custody: "pwce_bounded_development", limitations: ["PWCE stores and returns custody metadata only; Lifestream owns trace semantics and interpretation."] };
  }

  async #restoreEvents() {
    const state = await this.#store.load();
    const persisted = state.audit.filter((entry) => entry.type === "gateway.event" && entry.event).map((entry) => entry.event).sort((left, right) => Number(left.cursor) - Number(right.cursor));
    this.#eventSequence = persisted.reduce((maximum, event) => Math.max(maximum, Number(event.cursor) || 0), 0);
    this.#events = persisted.slice(-this.#eventRetention);
  }

  async #evidence(context, { evidenceRef }) {
    if (!evidenceRef) throw fail("invalid_request", "evidence.get requires evidenceRef");
    const state = await this.#store.load();
    const observation = state.observations.find((candidate) => candidate.recordId === evidenceRef);
    if (!observation) return { status: "unknown", reason: "evidence_not_found" };
    if (!context.siteRefs.includes(observation.payload.siteRef)) throw fail("scope_denied", "evidence is outside authority context");
    return {
      status: "known",
      evidence: observation,
      sourceRef: observation.sourceId,
      eventTime: observation.eventTime,
      recordedAt: observation.recordedAt,
      dataClassification: observation.dataClassification,
      integrity: observation.integrity,
      transformationRefs: observation.provenance?.transformationRefs ?? [],
      limitations: ["Evidence is the accepted normalized observation; provider payload fields not retained after normalization are unavailable."]
    };
  }

  async #audit(type, details) {
    await this.#store.transaction((state) => state.audit.push({ type, ...details, recordedAt: this.#clock().toISOString() }));
  }
}

export const gatewayProfile = Object.freeze({ profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, operationCatalogVersion: "0.1.0", operationCatalogDigest: catalogDigest, compatibilityRange: { minimum: PROFILE_VERSION, maximum: "1.x" }, fixtures: [{ fixtureSetId: "pwce.shared.contract.vectors", fixtureSetVersion: "0.1.0", status: "draft" }], health: { status: "development", custody: "bounded" }, operationCatalog });
