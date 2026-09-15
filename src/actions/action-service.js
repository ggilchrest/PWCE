import { createHash, randomUUID } from "node:crypto";
import { capabilityFor, capabilitySnapshot } from "./capability-catalog.js";
import { actionFingerprint } from "./approval-service.js";

const terminalActionStatuses = new Set(["succeeded", "partially_succeeded", "failed", "rejected", "denied", "timed_out", "cancelled", "outcome_unknown"]);

const unknownResult = reasonCode => ({ status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode });
const recoveryError = code => Object.assign(new Error(code), { code });
const needsReconciliation = action => action.status === 'started' ||
  action.result?.externalEffectOccurred === 'unknown' ||
  ['outcome_unknown','timed_out','cancelled','partially_succeeded'].includes(action.status) && action.result?.externalEffectOccurred !== false;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function verifyReconciliations(action) {
  if (action?.preconditionsRequired && !action.preconditionChecks?.length) throw recoveryError('precondition_evidence_missing');
  for (const [index, check] of (action?.preconditionChecks ?? []).entries()) {
    const { sha256, ...entry } = check;
    if (index > 1 || sha256 !== digest(entry) || entry.phase !== (index === 0 ? 'admission' : 'dispatch') || entry.targetIdentity !== action.targetIdentity || entry.requestFingerprint !== action.requestFingerprint ||
      !Number.isFinite(Date.parse(entry.checkedAt)) || typeof entry.result?.allowed !== 'boolean' || (index === 0 && !entry.result.allowed)) throw recoveryError('precondition_evidence_corrupt');
  }
  if (action?.snapshotRequired && action.capabilitySnapshot == null) throw recoveryError('snapshot_evidence_corrupt');
  if (action?.capabilitySnapshot != null) verifySnapshot(action.capabilitySnapshot, action);
  for (const { sha256, ...entry } of action?.reconciliations ?? []) {
    if (sha256 !== digest(entry) || entry.actionRef !== action.actionRef || entry.attemptRef !== action.attemptRef ||
      entry.requestFingerprint !== action.requestFingerprint || entry.targetIdentity !== action.targetIdentity) throw recoveryError('reconciliation_evidence_corrupt');
  }
  return action;
}
function verifySnapshot(binding, action) {
  try {
    if (Object.keys(binding).sort().join(',') !== 'expiresAt,sha256,snapshotJson,snapshotRef' ||
      typeof binding.snapshotJson !== 'string' || Buffer.byteLength(binding.snapshotJson) > 32768 ||
      createHash('sha256').update(binding.snapshotJson).digest('hex') !== binding.sha256) throw new Error();
    const record = JSON.parse(binding.snapshotJson), snapshot = record.snapshot;
    if (binding.snapshotRef !== snapshot.snapshotRef || binding.expiresAt !== snapshot.expiresAt || !Number.isFinite(Date.parse(binding.expiresAt)) ||
      !Array.isArray(record.scope) || record.scope.length !== 11 || !/^[0-9a-f]{64}$/.test(record.sourceDigest)) throw new Error();
    if (action && (snapshot.principalRef !== action.principalRef || !snapshot.siteRefs.includes(action.siteRef) ||
      record.scope[9] !== action.gatewayScope?.worldRef || record.scope[10] !== action.executionEnvironmentRef ||
      JSON.stringify(record.scope.slice(5, 9)) !== JSON.stringify([action.gatewayScope?.assistantRef, action.gatewayScope?.endpointRef, action.gatewayScope?.participantRefs, action.gatewayScope?.audienceRef]))) throw new Error();
  } catch { throw recoveryError('snapshot_evidence_corrupt'); }
}
export function normalizeTargetResult(result) {
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
  #preconditionTimeoutMs;

  constructor({ store, target, approvalService = null, liveEffectsEnabled = false, clock = () => new Date(), onGrantChanged = () => {}, targetIdentity = target?.identity ?? null, reconciliationTimeoutMs = 5000, preconditionTimeoutMs = 1000 }) {
    if (targetIdentity !== null && (typeof targetIdentity !== 'string' || targetIdentity.length < 1 || targetIdentity.length > 128)) throw new Error('invalid target identity');
    if (!Number.isInteger(reconciliationTimeoutMs) || reconciliationTimeoutMs < 1 || reconciliationTimeoutMs > 30000) throw new Error('invalid reconciliation timeout');
    if (!Number.isInteger(preconditionTimeoutMs) || preconditionTimeoutMs < 1 || preconditionTimeoutMs > 5000) throw new Error('invalid precondition timeout');
    this.#preconditionTimeoutMs = preconditionTimeoutMs;
    this.#targetIdentity = targetIdentity; this.#reconciliationTimeoutMs = reconciliationTimeoutMs;
    this.#store = store;
    this.#target = target;
    this.#approvalService = approvalService;
    this.#liveEffectsEnabled = liveEffectsEnabled;
    this.#clock = clock;
    this.#onGrantChanged = onGrantChanged;
  }

  snapshot() {
    const capabilities = capabilitySnapshot();
    return { version: "1.0.0", capabilities, bindingRef: digest({ capabilities, targetIdentity: this.#targetIdentity, liveEffectsEnabled: this.#liveEffectsEnabled }) };
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
    if (!request.parameters || Array.isArray(request.parameters) || Object.keys(request.parameters).length !== 1 || !Number.isFinite(request.parameters.level) || request.parameters.level < 0 || request.parameters.level > 1) return { outcome: "denied", rationaleCodes: ["invalid_parameters"] };
    if (typeof request.targetEntityId !== "string" || request.targetEntityId.length < 1 || request.targetEntityId.length > 128) return { outcome: "denied", rationaleCodes: ["invalid_target"] };
    if ((request.approvalRequired || capability.approval === 'always') && !request.approvalRef) return { outcome: 'approval_required', rationaleCodes: ['runtime_approval_required'] };
    return { outcome: "allowed", rationaleCodes: ["explicit_grant_active"], capabilityRef: capability.capabilityRef, effectClass: capability.effectClass };
  }

  async requestGatewayApproval(request, { assertCurrent, capabilitySnapshot }) {
    request = structuredClone(request); capabilitySnapshot = structuredClone(capabilitySnapshot);
    assertCurrent(); verifySnapshot(capabilitySnapshot, request);
    if (!this.#approvalService || !request.gatewayScope || this.preview(request).outcome !== 'approval_required') return null;
    return this.#approvalService.requestGateway({ request, snapshot: capabilitySnapshot, assertCurrent });
  }

  async #checkPreconditions(request, phase) {
    if (typeof this.#target?.checkPreconditions !== 'function' && request.executionEnvironmentRef !== 'live' && !request.preconditionsRequired) return null;
    const controller = new AbortController(), remaining = Math.min(this.#preconditionTimeoutMs, Date.parse(request.deadline ?? request.deadlineAt ?? new Date(this.#clock().valueOf() + this.#preconditionTimeoutMs).toISOString()) - this.#clock().valueOf());
    let timer, result = { allowed: false, reasonCode: 'target_preconditions_unavailable', observed: null };
    const expires = performance.now() + Math.max(0, remaining);
    try {
      if (!Number.isFinite(remaining) || remaining <= 0 || typeof this.#target?.checkPreconditions !== 'function') throw new Error();
      const value = await Promise.race([this.#target.checkPreconditions({ ...structuredClone(request), targetIdentity: this.#targetIdentity }, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error()); }, remaining); })]);
      // Reuse the bounded lossless-JSON validator without granting a target
      // permission to author host evidence identity or timestamps.
      const normalized = normalizeTargetResult({ status: 'denied', externalEffectOccurred: false, observed: value });
      if (performance.now() >= expires || normalized.reasonCode === 'target_invalid_result' || !value || Object.keys(value).sort().join(',') !== 'allowed,observed,reasonCode' || typeof value.allowed !== 'boolean' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(value.reasonCode) || Buffer.byteLength(JSON.stringify(value)) > 8192) throw new Error();
      result = structuredClone(value);
    } catch { /* Unavailable or late preconditions cannot authorize admission. */ }
    finally { clearTimeout(timer); controller.abort(); }
    const entry = { schemaVersion: '1.0.0', phase, targetIdentity: this.#targetIdentity, requestFingerprint: actionFingerprint(request), checkedAt: this.#clock().toISOString(), result };
    return { ...entry, sha256: digest(entry) };
  }

  async authorizeDispatch(request, { assertCurrent = () => {}, capabilitySnapshot = null } = {}) {
    request = structuredClone(request);
    // Snapshot custody is supplied by the trusted Gateway, never request JSON.
    capabilitySnapshot = structuredClone(capabilitySnapshot);
    if (capabilitySnapshot !== null) verifySnapshot(capabilitySnapshot, request);
    assertCurrent();
    const decision = this.preview(request);
    if (decision.outcome !== "allowed") return { decision, action: null };
    if (typeof request.idempotencyKey !== "string" || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 128) return { decision: { outcome: "denied", rationaleCodes: ["idempotency_required"] }, action: null };
    const grant = this.#grants.get(request.principalRef);
    const grantRevision = grant?.revision ?? 0;
    if ((request.approvalRequired || capabilityFor(request)?.approval === 'always') && (!this.#approvalService || !(await this.#approvalService.verify({ approvalRef: request.approvalRef, request, capabilitySnapshot })))) return { decision: { outcome: "denied", rationaleCodes: ["approval_invalid_or_expired"] }, action: null };
    if (this.#grants.get(request.principalRef)?.revision !== grantRevision) return { decision: { outcome: "denied", rationaleCodes: ["grant_changed_during_authorization"] }, action: null };
    assertCurrent();
    const fingerprint = actionFingerprint(request);
    const replay = state => {
      const existing = Object.values(state.actions).find(action => action.idempotencyKey === request.idempotencyKey);
      if (!existing) return null;
      verifyReconciliations(existing);
      if (existing.requestFingerprint !== fingerprint) throw recoveryError('idempotency_conflict');
      return { action: existing, duplicate: true };
    };
    // A retry reads the original result; changed device state cannot turn it
    // into a new admission or another target call.
    const prior = replay(await this.#store.load());
    assertCurrent();
    if (prior) return { decision, ...prior };
    const precondition = await this.#checkPreconditions(request, 'admission');
    assertCurrent();
    const result = await this.#store.transaction((state) => {
      assertCurrent();
      if (request.deadline && new Date(request.deadline) <= this.#clock()) return { action: null, decision: { outcome: "denied", rationaleCodes: ["deadline_exceeded"] } };
      if (this.#grants.get(request.principalRef)?.revision !== grantRevision) return { action: null, decision: { outcome: "denied", rationaleCodes: ["grant_changed_during_authorization"] } };
      const prior = replay(state);
      if (prior) return prior;
      if (precondition && !precondition.result.allowed) return { decision: { outcome: 'denied', rationaleCodes: [precondition.result.reasonCode] }, action: null };
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
        approvalRequired: Boolean(request.approvalRequired || capabilityFor(request)?.approval === 'always'),
        approvalRef: request.approvalRef ?? null,
        gatewayScope: request.gatewayScope ?? null,
        capabilitySnapshot,
        snapshotRequired: capabilitySnapshot !== null,
        preconditionsRequired: precondition !== null,
        preconditionChecks: precondition ? [precondition] : [],
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

  async dispatch(actionRef, { assertCurrent = () => {}, assertSnapshot } = {}) {
    assertCurrent();
    const inFlight = this.#inFlight.get(actionRef);
    if (inFlight) return inFlight;
    const operation = this.#dispatch(actionRef, assertCurrent, assertSnapshot);
    this.#inFlight.set(actionRef, operation);
    try {
      return await operation;
    } finally {
      this.#inFlight.delete(actionRef);
    }
  }

  #dispatchRestriction(action, assertCurrent, assertSnapshot) {
    if (action.executionEnvironmentRef === 'live' && !action.preconditionChecks?.some(check => check.phase === 'admission' && check.result.allowed)) return 'target_precondition_evidence_missing';
    try { assertCurrent(); } catch { return "authority_changed_before_dispatch"; }
    if (action.capabilitySnapshot !== null && action.capabilitySnapshot !== undefined) {
      if (typeof assertSnapshot !== 'function') return 'snapshot_binding_unavailable';
      try { assertSnapshot(structuredClone(action.capabilitySnapshot)); } catch { return 'snapshot_changed_before_dispatch'; }
    }
    if (action.targetIdentity && action.targetIdentity !== this.#targetIdentity) return "target_changed_before_dispatch";
    const grant = this.#grants.get(action.principalRef);
    const capability = capabilityFor(action);
    if (!capability || action.capabilityVersion !== capability.schemaVersion) return "capability_version_changed_before_dispatch";
    if (!grant || action.grantRevision !== grant.revision || !grant.siteRefs.has(action.siteRef) || !grant.capabilityRefs.has(action.capabilityRef)) return "grant_changed_before_dispatch";
    if (!action.deadlineAt || !Number.isFinite(Date.parse(action.deadlineAt)) || new Date(action.deadlineAt) <= this.#clock()) return "dispatch_deadline_exceeded";
    return null;
  }

  async #dispatch(actionRef, assertCurrent, assertSnapshot) {
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
      const restriction = this.#dispatchRestriction(action, assertCurrent, assertSnapshot);
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
    const approvalValid = !action.approvalRequired || (this.#approvalService && await this.#approvalService.verify({ approvalRef: action.approvalRef, request: action, capabilitySnapshot: action.capabilitySnapshot }));
    const precondition = approvalValid && action.preconditionsRequired ? await this.#checkPreconditions(action, 'dispatch') : null;
    if (precondition) {
      // Save the fresh check before the effect boundary, so interruption cannot
      // leave a sent action with only its earlier admission observation.
      await this.#store.transaction(state => {
        const current = state.actions[actionRef];
        if (!current || current.attemptRef !== action.attemptRef) throw recoveryError('action_attempt_changed');
        verifyReconciliations(current);
        current.preconditionChecks = [...current.preconditionChecks, precondition];
      });
    }
    const approvalStillValid = approvalValid && (!action.approvalRequired || await this.#approvalService.verify({ approvalRef: action.approvalRef, request: action, capabilitySnapshot: action.capabilitySnapshot }));
    const restriction = this.#dispatchRestriction(action, assertCurrent, assertSnapshot) ?? (precondition && !precondition.result.allowed ? precondition.result.reasonCode : null);
    if (restriction || !approvalStillValid) {
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
