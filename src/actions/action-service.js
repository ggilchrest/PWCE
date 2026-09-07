import { randomUUID } from "node:crypto";
import { canonicalize } from "../contract-foundation/canonical-json.js";

const capabilities = new Map([
  ["home.light.set_level", { capabilityRef: "home.light.set_level", operation: "light.set_level", effectClass: "reversible", approval: "policy", idempotency: "required", offline: "fixture_only", schemaVersion: "1.0.0" }]
]);

function requestFingerprint(request) {
  return canonicalize({ principalRef: request.principalRef ?? null, capabilityRef: request.capabilityRef, capabilityVersion: request.capabilityVersion ?? null, operation: request.operation, siteRef: request.siteRef, targetEntityId: request.targetEntityId, parameters: request.parameters });
}

function capabilityFor(request) {
  return capabilities.get(request.capabilityRef);
}

export class ActionService {
  #store;
  #target;
  #approvalService;
  #liveEffectsEnabled;
  #clock;
  #grants = new Map();
  #inFlight = new Map();
  #onGrantChanged;

  constructor({ store, target, approvalService = null, liveEffectsEnabled = false, clock = () => new Date(), onGrantChanged = () => {} }) {
    this.#store = store;
    this.#target = target;
    this.#approvalService = approvalService;
    this.#liveEffectsEnabled = liveEffectsEnabled;
    this.#clock = clock;
    this.#onGrantChanged = onGrantChanged;
  }

  snapshot() {
    return { version: "1.0.0", capabilities: [...capabilities.values()].map((capability) => ({ ...capability, available: true, authorization: "grant_required" })) };
  }

  registerGrant({ principalRef, siteRefs, capabilityRefs }) {
    const revision = (this.#grants.get(principalRef)?.revision ?? 0) + 1;
    this.#grants.set(principalRef, { revision, siteRefs: new Set(siteRefs), capabilityRefs: new Set(capabilityRefs) });
    this.#onGrantChanged({ principalRef, revision });
  }

  async getInvocation(actionRef) {
    const state = await this.#store.load();
    return state.actions[actionRef] ?? null;
  }

  getGrant(principalRef) {
    const grant = this.#grants.get(principalRef);
    return grant ? { revision: grant.revision, siteRefs: [...grant.siteRefs], capabilityRefs: [...grant.capabilityRefs] } : { revision: 0, siteRefs: [], capabilityRefs: [] };
  }

  setGrantChangeListener(listener) {
    if (typeof listener !== "function") throw new Error("grant listener must be a function");
    this.#onGrantChanged = listener;
  }

  preview(request) {
    const capability = capabilityFor(request);
    if (!capability || capability.operation !== request.operation) return { outcome: "denied", rationaleCodes: ["capability_not_available"] };
    if (request.capabilityVersion && request.capabilityVersion !== capability.schemaVersion) return { outcome: "denied", rationaleCodes: ["capability_version_mismatch"] };
    const grant = this.#grants.get(request.principalRef);
    if (!grant?.siteRefs.has(request.siteRef) || !grant.capabilityRefs.has(request.capabilityRef)) return { outcome: "denied", rationaleCodes: ["grant_missing"] };
    if (request.executionEnvironmentRef === "live" && !this.#liveEffectsEnabled) return { outcome: "denied", rationaleCodes: ["live_route_not_activated"] };
    if (request.approvalRequired && !request.approvalRef) return { outcome: "approval_required", rationaleCodes: ["runtime_approval_required"] };
    if (capability.approval === "always" && !request.approvalRef) return { outcome: "approval_required", rationaleCodes: ["runtime_approval_required"] };
    if (request.parameters?.level !== undefined && (typeof request.parameters.level !== "number" || request.parameters.level < 0 || request.parameters.level > 1)) return { outcome: "denied", rationaleCodes: ["invalid_parameters"] };
    return { outcome: "allowed", rationaleCodes: ["explicit_grant_active"], capabilityRef: capability.capabilityRef, effectClass: capability.effectClass };
  }

  async authorizeDispatch(request) {
    const decision = this.preview(request);
    if (decision.outcome !== "allowed") return { decision, action: null };
    if (typeof request.idempotencyKey !== "string" || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 128) return { decision: { outcome: "denied", rationaleCodes: ["idempotency_required"] }, action: null };
    const grant = this.#grants.get(request.principalRef);
    const grantRevision = grant?.revision ?? 0;
    if (request.approvalRequired && (!this.#approvalService || !(await this.#approvalService.verify({ approvalRef: request.approvalRef, request })))) return { decision: { outcome: "denied", rationaleCodes: ["approval_invalid_or_expired"] }, action: null };
    if (this.#grants.get(request.principalRef)?.revision !== grantRevision) return { decision: { outcome: "denied", rationaleCodes: ["grant_changed_during_authorization"] }, action: null };
    const fingerprint = requestFingerprint(request);
    const result = await this.#store.transaction((state) => {
      if (this.#grants.get(request.principalRef)?.revision !== grantRevision) return { action: null, decision: { outcome: "denied", rationaleCodes: ["grant_changed_during_authorization"] } };
      const existing = Object.values(state.actions).find((action) => action.idempotencyKey === request.idempotencyKey);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          const error = new Error("idempotency key conflicts with a different action");
          error.code = "idempotency_conflict";
          throw error;
        }
        return { action: existing, duplicate: true };
      }
      const action = {
        actionRef: randomUUID(),
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: fingerprint,
        principalRef: request.principalRef,
        capabilityRef: request.capabilityRef,
        capabilityVersion: request.capabilityVersion ?? capabilityFor(request).schemaVersion,
        operation: request.operation,
        siteRef: request.siteRef,
        targetEntityId: request.targetEntityId,
        parameters: request.parameters,
        executionEnvironmentRef: request.executionEnvironmentRef ?? "test",
        grantRevision,
        status: "admitted",
        decision: { outcome: decision.outcome, rationaleCodes: decision.rationaleCodes },
        createdAt: this.#clock().toISOString(),
        result: null
      };
      state.actions[action.actionRef] = action;
      state.audit.push({ type: "action.admitted", actionRef: action.actionRef, siteRef: action.siteRef, recordedAt: action.createdAt });
      return { action, duplicate: false };
    });
    return { decision, ...result.result };
  }

  async dispatch(actionRef) {
    const inFlight = this.#inFlight.get(actionRef);
    if (inFlight) return inFlight;
    const operation = this.#dispatch(actionRef);
    this.#inFlight.set(actionRef, operation);
    try {
      return await operation;
    } finally {
      this.#inFlight.delete(actionRef);
    }
  }

  async #dispatch(actionRef) {
    const state = await this.#store.load();
    const action = state.actions[actionRef];
    if (!action) throw new Error("action not found");
    if (action.status === "succeeded" || action.status === "failed" || action.status === "timed_out" || action.status === "outcome_unknown") return action;
    const grant = this.#grants.get(action.principalRef);
    const capability = capabilityFor(action);
    if (!grant || !capability || action.grantRevision !== grant.revision || action.capabilityVersion !== capability.schemaVersion || !grant.siteRefs.has(action.siteRef) || !grant.capabilityRefs.has(action.capabilityRef)) {
      const reasonCode = !capability || action.capabilityVersion !== capability?.schemaVersion ? "capability_version_changed_before_dispatch" : "grant_changed_before_dispatch";
      const denied = await this.#store.transaction((next) => {
        const current = next.actions[actionRef];
        current.status = "denied";
        current.result = { status: "denied", externalEffectOccurred: false, reasonCode, completedAt: this.#clock().toISOString() };
        next.audit.push({ type: "action.result", actionRef, status: current.status, recordedAt: current.result.completedAt });
        return current;
      });
      return denied.result.result;
    }
    const targetResult = await this.#target.invoke(action);
    const updated = await this.#store.transaction((next) => {
      const current = next.actions[actionRef];
      current.status = targetResult.status;
      current.result = { ...targetResult, completedAt: this.#clock().toISOString() };
      next.audit.push({ type: "action.result", actionRef, status: current.status, recordedAt: current.result.completedAt });
      return current;
    });
    return updated.result;
  }

  async reconcile(actionRef) {
    const state = await this.#store.load();
    const action = state.actions[actionRef];
    if (!action) throw new Error("action not found");
    if (typeof this.#target.reconcile !== "function") throw new Error("action target does not support reconciliation");
    const reconciliation = await this.#target.reconcile(action);
    const updated = await this.#store.transaction((next) => {
      const current = next.actions[actionRef];
      current.status = reconciliation.status;
      current.result = { ...current.result, ...reconciliation, reconciledAt: this.#clock().toISOString() };
      next.audit.push({ type: "action.reconciled", actionRef, status: current.status, recordedAt: current.result.reconciledAt });
      return current;
    });
    return updated.result;
  }
}
