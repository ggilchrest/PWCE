import { randomUUID } from "node:crypto";
import { capabilityFor, capabilitySnapshot } from "./capability-catalog.js";
import { actionFingerprint } from "./approval-service.js";

const terminalActionStatuses = new Set(["succeeded", "partially_succeeded", "failed", "rejected", "denied", "timed_out", "cancelled", "outcome_unknown"]);

function normalizeTargetResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result) || !terminalActionStatuses.has(result.status) || ![true, false, "unknown"].includes(result.externalEffectOccurred)) {
    return { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "target_invalid_result" };
  }
  return result;
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
    return { version: "1.0.0", capabilities: capabilitySnapshot() };
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
    if (request.deadline !== undefined && (typeof request.deadline !== "string" || !Number.isFinite(Date.parse(request.deadline)) || new Date(request.deadline) <= this.#clock())) {
      return { outcome: "denied", rationaleCodes: ["deadline_exceeded"] };
    }
    const capability = capabilityFor(request);
    if (!capability || capability.operation !== request.operation) return { outcome: "denied", rationaleCodes: ["capability_not_available"] };
    if (request.capabilityVersion && request.capabilityVersion !== capability.schemaVersion) return { outcome: "denied", rationaleCodes: ["capability_version_mismatch"] };
    const grant = this.#grants.get(request.principalRef);
    if (!grant?.siteRefs.has(request.siteRef) || !grant.capabilityRefs.has(request.capabilityRef)) return { outcome: "denied", rationaleCodes: ["grant_missing"] };
    if (request.executionEnvironmentRef === "live" && !this.#liveEffectsEnabled) return { outcome: "denied", rationaleCodes: ["live_route_not_activated"] };
    if (request.approvalRequired && !request.approvalRef) return { outcome: "approval_required", rationaleCodes: ["runtime_approval_required"] };
    if (capability.approval === "always" && !request.approvalRef) return { outcome: "approval_required", rationaleCodes: ["runtime_approval_required"] };
    if (!request.parameters || Array.isArray(request.parameters) || Object.keys(request.parameters).length !== 1 || !Number.isFinite(request.parameters.level) || request.parameters.level < 0 || request.parameters.level > 1) return { outcome: "denied", rationaleCodes: ["invalid_parameters"] };
    if (typeof request.targetEntityId !== "string" || request.targetEntityId.length < 1 || request.targetEntityId.length > 128) return { outcome: "denied", rationaleCodes: ["invalid_target"] };
    return { outcome: "allowed", rationaleCodes: ["explicit_grant_active"], capabilityRef: capability.capabilityRef, effectClass: capability.effectClass };
  }

  async authorizeDispatch(request, { assertCurrent = () => {} } = {}) {
    request = structuredClone(request);
    assertCurrent();
    const decision = this.preview(request);
    if (decision.outcome !== "allowed") return { decision, action: null };
    if (typeof request.idempotencyKey !== "string" || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 128) return { decision: { outcome: "denied", rationaleCodes: ["idempotency_required"] }, action: null };
    const grant = this.#grants.get(request.principalRef);
    const grantRevision = grant?.revision ?? 0;
    if (request.approvalRequired && (!this.#approvalService || !(await this.#approvalService.verify({ approvalRef: request.approvalRef, request })))) return { decision: { outcome: "denied", rationaleCodes: ["approval_invalid_or_expired"] }, action: null };
    if (this.#grants.get(request.principalRef)?.revision !== grantRevision) return { decision: { outcome: "denied", rationaleCodes: ["grant_changed_during_authorization"] }, action: null };
    assertCurrent();
    const fingerprint = actionFingerprint(request);
    const result = await this.#store.transaction((state) => {
      assertCurrent();
      if (request.deadline && new Date(request.deadline) <= this.#clock()) return { action: null, decision: { outcome: "denied", rationaleCodes: ["deadline_exceeded"] } };
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
        deadlineAt: new Date(Math.min(request.deadline ? Date.parse(request.deadline) : Infinity, this.#clock().valueOf() + 30_000)).toISOString(),
        approvalRequired: Boolean(request.approvalRequired),
        approvalRef: request.approvalRef ?? null,
        gatewayScope: request.gatewayScope ?? null,
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

  async dispatch(actionRef, { assertCurrent = () => {} } = {}) {
    assertCurrent();
    const inFlight = this.#inFlight.get(actionRef);
    if (inFlight) return inFlight;
    const operation = this.#dispatch(actionRef, assertCurrent);
    this.#inFlight.set(actionRef, operation);
    try {
      return await operation;
    } finally {
      this.#inFlight.delete(actionRef);
    }
  }

  #dispatchRestriction(action, assertCurrent) {
    try { assertCurrent(); } catch { return "authority_changed_before_dispatch"; }
    const grant = this.#grants.get(action.principalRef);
    const capability = capabilityFor(action);
    if (!capability || action.capabilityVersion !== capability.schemaVersion) return "capability_version_changed_before_dispatch";
    if (!grant || action.grantRevision !== grant.revision || !grant.siteRefs.has(action.siteRef) || !grant.capabilityRefs.has(action.capabilityRef)) return "grant_changed_before_dispatch";
    if (!action.deadlineAt || !Number.isFinite(Date.parse(action.deadlineAt)) || new Date(action.deadlineAt) <= this.#clock()) return "dispatch_deadline_exceeded";
    return null;
  }

  async #dispatch(actionRef, assertCurrent) {
    // Persist the attempted boundary before calling the target. A second owner
    // or restored process sees uncertainty, never permission to try again.
    const claimed = await this.#store.transaction((state) => {
      const action = state.actions[actionRef];
      if (!action) throw new Error("action not found");
      if (terminalActionStatuses.has(action.status)) return { action, claimed: false };
      if (action.status !== "admitted") {
        action.status = "outcome_unknown";
        action.result = { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "prior_dispatch_requires_reconciliation", completedAt: this.#clock().toISOString() };
        state.audit.push({ type: "action.result", actionRef, status: action.status, recordedAt: action.result.completedAt });
        return { action, claimed: false };
      }
      const restriction = this.#dispatchRestriction(action, assertCurrent);
      if (restriction) {
        action.status = "denied";
        action.result = { status: "denied", externalEffectOccurred: false, reasonCode: restriction, completedAt: this.#clock().toISOString() };
        state.audit.push({ type: "action.result", actionRef, status: action.status, recordedAt: action.result.completedAt });
        return { action, claimed: false };
      }
      action.status = "started";
      action.attemptRef = randomUUID();
      action.startedAt = this.#clock().toISOString();
      state.audit.push({ type: "action.started", actionRef, siteRef: action.siteRef, recordedAt: action.startedAt });
      return { action, claimed: true };
    });
    const { action } = claimed.result;
    if (!claimed.result.claimed) return action;
    let targetResult;
    // Approval may expire or be withdrawn while admission is being persisted.
    const approvalValid = !action.approvalRequired || (this.#approvalService && await this.#approvalService.verify({ approvalRef: action.approvalRef, request: action }));
    const restriction = this.#dispatchRestriction(action, assertCurrent);
    if (restriction || !approvalValid) {
      targetResult = { status: "denied", externalEffectOccurred: false, reasonCode: restriction ?? "approval_invalid_or_expired" };
    } else {
      targetResult = await this.#invokeTarget(action);
    }
    targetResult = normalizeTargetResult(targetResult);
    const updated = await this.#store.transaction((next) => {
      const current = next.actions[actionRef];
      if (!current || current.attemptRef !== action.attemptRef) throw new Error("action attempt changed before result persistence");
      // A reconciliation is newer evidence; a delayed dispatch reply cannot erase it.
      if (current.result?.reconciledAt) return current;
      current.status = targetResult.status;
      current.result = { ...targetResult, completedAt: this.#clock().toISOString() };
      next.audit.push({ type: "action.result", actionRef, status: current.status, recordedAt: current.result.completedAt });
      return current;
    });
    return updated.result;
  }

  async #invokeTarget(action) {
    const controller = new AbortController();
    const remainingMs = Math.max(0, Math.min(30_000, Date.parse(action.deadlineAt) - this.#clock().valueOf()));
    const startedAt = performance.now();
    let timer;
    const expired = { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "target_deadline_exceeded" };
    try {
      // The timer bounds even a target that ignores cancellation. It cannot prove
      // that a request already sent to an external system had no effect.
      const result = await Promise.race([
        this.#target.invoke(structuredClone(action), { signal: controller.signal }),
        new Promise((resolve) => {
          timer = setTimeout(() => { resolve(expired); controller.abort(); }, remainingMs);
        })
      ]);
      return performance.now() - startedAt >= remainingMs || new Date(action.deadlineAt) <= this.#clock() ? expired : result;
    } catch {
      return { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "target_invocation_failed" };
    } finally {
      clearTimeout(timer);
    }
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
