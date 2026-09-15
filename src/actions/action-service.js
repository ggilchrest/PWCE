import { createHash, randomUUID } from "node:crypto";
import { capabilityFor, capabilitySnapshot } from "./capability-catalog.js";
import { actionFingerprint } from "./approval-service.js";

const terminalActionStatuses = new Set(["succeeded", "partially_succeeded", "failed", "rejected", "denied", "timed_out", "cancelled", "outcome_unknown"]);

const unknownResult = reasonCode => ({ status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode });
const recoveryError = code => Object.assign(new Error(code), { code });
const needsReconciliation = action => action.status === 'started' ||
  ['outcome_unknown','timed_out','cancelled','partially_succeeded'].includes(action.status) && action.result?.externalEffectOccurred !== false;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function verifyReconciliations(action) {
  for (const { sha256, ...entry } of action?.reconciliations ?? []) {
    if (sha256 !== digest(entry) || entry.actionRef !== action.actionRef || entry.attemptRef !== action.attemptRef ||
      entry.requestFingerprint !== action.requestFingerprint || entry.targetIdentity !== action.targetIdentity) throw recoveryError('reconciliation_evidence_corrupt');
  }
  return action;
}
function normalizeTargetResult(result) {
  // Target feedback must be bounded, lossless JSON. Never persist provider-owned
  // objects or allow supplied timestamps to impersonate host reconciliation.
  let nodes = 0, bytes = 0;
  const seen = new Set();
  const valid = (value, depth = 0) => {
    if (++nodes > 2048 || depth > 24) return false;
    if (typeof value === 'string') { bytes += Buffer.byteLength(value); return bytes <= 16384; }
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
    seen.add(value);
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value) && (value.length > 2048 || keys.length !== value.length + 1)) return false;
    for (const key of keys) {
      if (Array.isArray(value) && key === 'length') continue;
      if (Array.isArray(value) && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) || !valid(key, depth + 1) || !valid(descriptor.value, depth + 1)) return false;
    }
    seen.delete(value); return true;
  };
  try {
    if (!valid(result) || !result || Array.isArray(result) || !terminalActionStatuses.has(result.status) || ![true, false, 'unknown'].includes(result.externalEffectOccurred) ||
      (['succeeded','partially_succeeded'].includes(result.status) && result.externalEffectOccurred !== true) ||
      (result.status === 'outcome_unknown' && result.externalEffectOccurred !== 'unknown') ||
      (['denied','rejected'].includes(result.status) && result.externalEffectOccurred !== false) ||
      Object.keys(result).some(key => !['status','externalEffectOccurred','reasonCode','observed','dispatchAcknowledged'].includes(key)) ||
      (result.reasonCode !== undefined && (typeof result.reasonCode !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(result.reasonCode))) ||
      (result.dispatchAcknowledged !== undefined && typeof result.dispatchAcknowledged !== 'boolean')) return unknownResult('target_invalid_result');
    const json = JSON.stringify(result);
    return Buffer.byteLength(json) <= 16384 ? JSON.parse(json) : unknownResult('target_invalid_result');
  } catch { return unknownResult('target_invalid_result'); }
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
  #targetIdentity;
  #reconciliationTimeoutMs;

  constructor({ store, target, approvalService = null, liveEffectsEnabled = false, clock = () => new Date(), onGrantChanged = () => {}, targetIdentity = target?.identity ?? null, reconciliationTimeoutMs = 5000 }) {
    if (targetIdentity !== null && (typeof targetIdentity !== 'string' || targetIdentity.length < 1 || targetIdentity.length > 128)) throw new Error('invalid target identity');
    if (!Number.isInteger(reconciliationTimeoutMs) || reconciliationTimeoutMs < 1 || reconciliationTimeoutMs > 30000) throw new Error('invalid reconciliation timeout');
    this.#targetIdentity = targetIdentity; this.#reconciliationTimeoutMs = reconciliationTimeoutMs;
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
    return verifyReconciliations(state.actions[actionRef]) ?? null;
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
        targetIdentity: this.#targetIdentity,
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
    if (action.targetIdentity && action.targetIdentity !== this.#targetIdentity) return "target_changed_before_dispatch";
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
      verifyReconciliations(action);
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
      // Preserve the actual dispatch reply even when a newer read has already
      // confirmed its outcome. Uncertain reads must not suppress confirmation.
      current.dispatchResult ??= { ...targetResult, completedAt: this.#clock().toISOString() };
      if (current.reconciliations?.length && !needsReconciliation(current)) return current;
      current.status = targetResult.status;
      current.result = structuredClone(current.dispatchResult);
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

  async reconcile(actionRef, { assertCurrent = () => {}, signal, deadline } = {}) {
    const started = performance.now(), now = this.#clock().valueOf();
    if (!Number.isFinite(now) || (deadline !== undefined && !Number.isFinite(Date.parse(deadline)))) throw recoveryError('invalid_reconciliation_deadline');
    const remainingMs = Math.min(this.#reconciliationTimeoutMs, deadline === undefined ? Infinity : Date.parse(deadline) - now);
    const deadlineAt = new Date(now + Math.max(0, remainingMs)).toISOString();
    const check = () => { assertCurrent(); if (signal?.aborted) throw recoveryError('reconciliation_cancelled'); };
    check();
    if (remainingMs <= 0) throw recoveryError('reconciliation_deadline_exceeded');
    const state = await this.#store.load(); check();
    if (performance.now() - started >= remainingMs || this.#clock().valueOf() >= Date.parse(deadlineAt)) throw recoveryError('reconciliation_deadline_exceeded');
    const action = state.actions[actionRef];
    if (!action) throw recoveryError('action_not_found');
    verifyReconciliations(action);
    if (!needsReconciliation(action)) return action;
    if (!action.attemptRef || !action.startedAt || !action.targetIdentity || action.targetIdentity !== this.#targetIdentity || typeof this.#target.reconcile !== 'function') return action;
    // A read deadline is fresh: an expired dispatch deadline must not prevent
    // checking an effect already sent. No new invocation is created here.
    const controller = new AbortController(); let timer, onAbort;
    let reported;
    try {
      const pending = Promise.resolve().then(() => { check(); if (performance.now() - started >= remainingMs || this.#clock().valueOf() >= Date.parse(deadlineAt)) throw recoveryError('reconciliation_deadline_exceeded'); return this.#target.reconcile(structuredClone(action), { signal: controller.signal, deadlineAt }); });
      const timeout = new Promise(resolve => { timer = setTimeout(() => { resolve(unknownResult('target_reconciliation_deadline_exceeded')); controller.abort(); }, Math.max(0, remainingMs - (performance.now() - started))); });
      const cancelled = new Promise((_, reject) => { onAbort = () => { controller.abort(); reject(recoveryError('reconciliation_cancelled')); }; signal?.addEventListener('abort', onAbort, { once: true }); if (signal?.aborted) onAbort(); });
      try { reported = normalizeTargetResult(await Promise.race([pending, timeout, cancelled])); }
      catch (error) { check(); if (error?.code === 'reconciliation_cancelled') throw error; reported = unknownResult('target_reconciliation_failed'); }
      check();
      if (performance.now() - started >= remainingMs || this.#clock().valueOf() >= Date.parse(deadlineAt)) reported = unknownResult('target_reconciliation_deadline_exceeded');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); controller.abort(); }
    check();
    const completedAt = this.#clock().toISOString();
    const updated = await this.#store.transaction(next => {
      check();
      const current = next.actions[actionRef];
      if (!current || current.attemptRef !== action.attemptRef || current.requestFingerprint !== action.requestFingerprint ||
        actionFingerprint(current) !== actionFingerprint(action) || current.targetIdentity !== action.targetIdentity) throw recoveryError('reconciliation_binding_changed');
      const history = current.reconciliations ?? [];
      verifyReconciliations(current);
      const same = history.at(-1)?.reportedResult && digest(history.at(-1).reportedResult) === digest(reported);
      if (same || !needsReconciliation(current)) return current;
      const confirming = !needsReconciliation({ status: reported.status, result: reported });
      if (history.length >= 16 && !confirming) throw recoveryError('reconciliation_capacity');
      // Keep the earlier projection and its exact dispatch reply. Host metadata
      // is separate from target feedback; history is never merged into feedback.
      current.reconciliationOrigin ??= { status: current.status, result: structuredClone(current.result) };
      const entry = { reconciliationRef: randomUUID(), actionRef, attemptRef: action.attemptRef, requestFingerprint: action.requestFingerprint,
        targetIdentity: action.targetIdentity, startedAt: new Date(now).toISOString(), completedAt,
        priorStatus: current.status, priorResultSha256: digest(current.result), reportedResult: reported };
      current.reconciliations = [...history, { ...entry, sha256: digest(entry) }];
      current.status = reported.status;
      current.result = { ...reported, completedAt, reconciledAt: completedAt };
      next.audit.push({ type: 'action.reconciled', actionRef, reconciliationRef: entry.reconciliationRef, status: current.status, recordedAt: completedAt });
      check(); return current;
    });
    check(); return updated.result;
  }
}
