import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from "node:crypto";
import { capabilityFor } from "./capability-catalog.js";
import { canonicalize } from "../contract-foundation/canonical-json.js";

export function actionFingerprint(request) {
  return canonicalize({ principalRef: request.principalRef ?? null, capabilityRef: request.capabilityRef, capabilityVersion: request.capabilityVersion ?? capabilityFor(request)?.schemaVersion ?? null, operation: request.operation, siteRef: request.siteRef, targetEntityId: request.targetEntityId, parameters: request.parameters, executionEnvironmentRef: request.executionEnvironmentRef ?? "test", gatewayScope: request.gatewayScope ?? null });
}
const failure = code => Object.assign(new Error(code), { code, statusCode: ['approval_confirmation_changed','idempotency_conflict','approval_expired'].includes(code) ? 409 : code === 'human_authentication_required' ? 403 : 400 });
const hash = value => createHash('sha256').update(value).digest('hex');
function checkGatewayApproval(approval) {
  if (!approval?.gatewayReview) return;
  const review = approval.gatewayReview, snapshot = approval.gatewaySnapshot;
  if (!review.request || !snapshot || typeof snapshot.snapshotJson !== 'string' || hash(snapshot.snapshotJson) !== snapshot.sha256 ||
    approval.principalRef !== review.request.principalRef || approval.requestedBy !== review.request.principalRef || approval.siteRef !== review.request.siteRef || approval.capabilityRef !== review.request.capabilityRef ||
    canonicalize(review.request) !== approval.actionFingerprint || review.idempotencyKey !== approval.requestKey ||
    hash(canonicalize({ review, snapshotSha256: snapshot.sha256, expiresAt: approval.expiresAt })) !== approval.confirmationDigest) throw failure('approval_evidence_corrupt');
  if (approval.status === 'approved' && (!approval.humanProof || approval.humanProof.principalRef !== approval.approvedBy ||
    !['password','recovery_code'].includes(approval.humanProof.authenticationMethod) ||
    !Number.isFinite(Date.parse(approval.approvedAt)) || !Number.isFinite(Date.parse(approval.humanProof.authenticatedAt)) || !Number.isFinite(Date.parse(approval.humanProof.verifiedAt)) ||
    Date.parse(approval.humanProof.authenticatedAt) > Date.parse(approval.humanProof.verifiedAt) ||
    Date.parse(approval.humanProof.verifiedAt) > Date.parse(approval.approvedAt))) throw failure('approval_evidence_corrupt');
}
export function approvalView(approval) {
  checkGatewayApproval(approval);
  if (!approval?.gatewayReview) return approval;
  const { gatewaySnapshot: _snapshot, actionFingerprint: _fingerprint, ...view } = approval;
  return structuredClone(view);
}

export class ApprovalService {
  #store;
  #clock;

  constructor({ store, clock = () => new Date() }) {
    this.#store = store;
    this.#clock = clock;
  }

  async request({ request, requestedBy, expiresInMs = 120_000 }) {
    if (!Number.isInteger(expiresInMs) || expiresInMs < 1 || expiresInMs > 900_000) throw new Error("approval expiry outside allowed range");
    const createdAt = this.#clock().toISOString();
    const approval = { approvalRef: randomUUID(), actionFingerprint: actionFingerprint(request), requestedBy, principalRef: request.principalRef ?? null, siteRef: request.siteRef ?? null, capabilityRef: request.capabilityRef ?? null, status: "pending", createdAt, expiresAt: new Date(this.#clock().valueOf() + expiresInMs).toISOString(), approvedBy: null, approvedAt: null };
    await this.#store.transaction((state) => { state.approvals[approval.approvalRef] = approval; state.audit.push({ type: "approval.requested", approvalRef: approval.approvalRef, recordedAt: createdAt }); });
    return approval;
  }

  async requestGateway({ request, snapshot, assertCurrent }) {
    request = structuredClone(request); snapshot = structuredClone(snapshot);
    if (!request.gatewayScope || typeof request.idempotencyKey !== 'string' || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 128) throw failure('invalid_approval_request');
    const fingerprint = actionFingerprint(request), createdAt = this.#clock().toISOString();
    const expiresAt = new Date(Math.min(Date.parse(snapshot.expiresAt), Date.parse(createdAt) + 120_000)).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw failure('approval_expired');
    const review = { request: JSON.parse(fingerprint), idempotencyKey: request.idempotencyKey,
      effectSummary: `Set brightness of ${request.targetEntityId} at ${request.siteRef} to level ${request.parameters.level} on the 0–1 scale.`,
      effectClass: capabilityFor(request).effectClass };
    const approval = { approvalRef: randomUUID(), actionFingerprint: fingerprint, requestedBy: request.principalRef,
      principalRef: request.principalRef, siteRef: request.siteRef, capabilityRef: request.capabilityRef, requestKey: request.idempotencyKey,
      status: 'pending', createdAt, expiresAt, approvedBy: null, approvedAt: null, gatewayReview: review, gatewaySnapshot: snapshot,
      confirmationDigest: hash(canonicalize({ review, snapshotSha256: snapshot.sha256, expiresAt })) };
    checkGatewayApproval(approval);
    const result = await this.#store.transaction(state => {
      assertCurrent();
      const existing = Object.values(state.approvals).find(item => item.gatewayReview && item.principalRef === request.principalRef && item.requestKey === request.idempotencyKey);
      if (existing) {
        checkGatewayApproval(existing);
        if (existing.actionFingerprint !== fingerprint || existing.gatewaySnapshot.sha256 !== snapshot.sha256) throw failure('idempotency_conflict');
        return existing;
      }
      if (Object.keys(state.approvals).length >= 4096) throw failure('approval_capacity_exceeded');
      state.approvals[approval.approvalRef] = approval;
      state.audit.push({ type: 'approval.requested', approvalRef: approval.approvalRef, principalRef: request.principalRef, siteRef: request.siteRef, recordedAt: createdAt });
      assertCurrent(); return approval;
    });
    assertCurrent(); return approvalView(result.result);
  }

  /** Original qualified record only. This read does not advance expiry state. */
  async readGatewayEvidence({ principalRef, requestKey, requestFingerprint, originalSnapshotRef, assertCurrent }) {
    assertCurrent();const state=await this.#store.load();assertCurrent();
    const matches=Object.values(state.approvals).filter(item=>item.gatewayReview&&item.principalRef===principalRef&&item.requestKey===requestKey);if(matches.length>1)throw failure('approval_evidence_corrupt');const approval=matches[0];
    if(!approval||approval.actionFingerprint!==requestFingerprint||approval.gatewaySnapshot?.snapshotRef!==originalSnapshotRef)return null;
    checkGatewayApproval(approval);
    const text=(value,max=128)=>typeof value==='string'&&value.length>0&&value.length<=max;
    const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
    const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===expected;
    const review=approval.gatewayReview,r=review.request,g=r.gatewayScope,snapshot=approval.gatewaySnapshot;
    let source;try{source=JSON.parse(snapshot.snapshotJson);}catch{throw failure('approval_evidence_corrupt');}
    if(!['pending','approved','expired'].includes(approval.status)||!text(approval.approvalRef)||!text(approval.requestKey)||!text(approval.principalRef)||!text(approval.siteRef)||!text(r.targetEntityId)||!time(approval.createdAt)||!time(approval.expiresAt)||Date.parse(approval.expiresAt)<=Date.parse(approval.createdAt)||
      !keys(review,'effectClass,effectSummary,idempotencyKey,request')||!text(review.effectSummary,4096)||review.effectClass!=='reversible'||r.capabilityRef!=='home.light.set_level'||r.capabilityVersion!=='1.0.0'||r.operation!=='light.set_level'||!keys(r.parameters,'level')||!Number.isFinite(r.parameters.level)||r.parameters.level<0||r.parameters.level>1||actionFingerprint(r)!==approval.actionFingerprint||
      !keys(g,'assistantRef,audienceRef,endpointRef,participantRefs,worldRef')||!text(g.worldRef)||![g.assistantRef,g.endpointRef,g.audienceRef].every(value=>value===null||text(value))||!Array.isArray(g.participantRefs)||g.participantRefs.length>32||!g.participantRefs.every(value=>text(value))||new Set(g.participantRefs).size!==g.participantRefs.length||
      !keys(snapshot,'expiresAt,sha256,snapshotJson,snapshotRef')||!text(snapshot.snapshotRef)||!time(snapshot.expiresAt)||Buffer.byteLength(snapshot.snapshotJson)>32768||source?.snapshot?.snapshotRef!==snapshot.snapshotRef||source.snapshot.principalRef!==approval.principalRef||source.snapshot.expiresAt!==snapshot.expiresAt||!Array.isArray(source.scope)||source.scope.length!==11||source.scope[1]!==approval.principalRef||!Array.isArray(source.scope[4])||!source.scope[4].includes(approval.siteRef)||!isDeepStrictEqual(source.scope.slice(5),[g.assistantRef,g.endpointRef,g.participantRefs,g.audienceRef,g.worldRef,r.executionEnvironmentRef])||Date.parse(approval.expiresAt)>Date.parse(snapshot.expiresAt)||
      (approval.status!=='approved'&&(approval.approvedBy!==null||approval.approvedAt!==null||approval.humanProof!=null))||(approval.status==='approved'&&(!text(approval.approvedBy)||!keys(approval.humanProof,'authenticatedAt,authenticationMethod,principalRef,verifiedAt'))))throw failure('approval_evidence_corrupt');
    const evidence={schemaVersion:'1.0.0',kind:'pwce.action.approval',approvalRef:approval.approvalRef,requestKey:approval.requestKey,requestFingerprint:approval.actionFingerprint,principalRef:approval.principalRef,siteRef:approval.siteRef,capabilityRef:approval.capabilityRef,status:approval.status,createdAt:approval.createdAt,expiresAt:approval.expiresAt,approvedBy:approval.approvedBy,approvedAt:approval.approvedAt,humanProof:approval.humanProof??null,review:approval.gatewayReview,snapshot:approval.gatewaySnapshot,confirmationDigest:approval.confirmationDigest};
    assertCurrent();return structuredClone(evidence);
  }

  async approve({ approvalRef, approvedBy, confirmationDigest, humanProof, assertCurrent = () => {} }) {
    const result = await this.#store.transaction((state) => {
      assertCurrent();
      const approval = state.approvals[approvalRef];
      if (!approval) throw new Error("approval not found");
      checkGatewayApproval(approval);
      if (approval.gatewayReview) {
        if (confirmationDigest !== approval.confirmationDigest) throw failure('approval_confirmation_changed');
        if (!humanProof || humanProof.principalRef !== approvedBy || !['password','recovery_code'].includes(humanProof.authenticationMethod) ||
          !Number.isFinite(Date.parse(humanProof.authenticatedAt)) || !Number.isFinite(Date.parse(humanProof.verifiedAt)) ||
          Date.parse(humanProof.authenticatedAt) > Date.parse(humanProof.verifiedAt) || Date.parse(humanProof.verifiedAt) > this.#clock().valueOf()) throw failure('human_authentication_required');
        if (approval.status === 'approved' && approval.approvedBy === approvedBy) return { approval, expired: false };
      }
      if (approval.status !== "pending") throw new Error("approval is not pending");
      if (new Date(approval.expiresAt) <= this.#clock()) {
        approval.status = "expired";
        const recordedAt = this.#clock().toISOString();
        state.audit.push({ type: "approval.expired", approvalRef, recordedAt });
        return { approval, expired: true };
      }
      approval.status = "approved";
      approval.approvedBy = approvedBy;
      approval.approvedAt = this.#clock().toISOString();
      if (approval.gatewayReview) approval.humanProof = structuredClone(humanProof);
      state.audit.push({ type: "approval.approved", approvalRef, approvedBy, recordedAt: approval.approvedAt });
      assertCurrent();
      return { approval, expired: false };
    });
    if (result.result.expired) throw new Error("approval expired");
    assertCurrent(); return approvalView(result.result.approval);
  }

  async listGateway({ siteRefs, limit = 20, after = null }) {
    if (!Array.isArray(siteRefs) || !Number.isInteger(limit) || limit < 1 || limit > 50 || (after !== null && (typeof after !== 'string' || after.length > 128))) throw failure('invalid_request');
    const state = await this.#store.load();
    const records = Object.values(state.approvals).filter(item => item.gatewayReview && siteRefs.includes(item.siteRef) && (after === null || item.approvalRef > after)).sort((a,b) => a.approvalRef.localeCompare(b.approvalRef));
    return { approvals: records.slice(0,limit).map(item => approvalView(item)), nextCursor: records.length > limit ? records[limit - 1].approvalRef : null };
  }

  async get({ approvalRef }) {
    const result = await this.#store.transaction((state) => {
      const approval = state.approvals[approvalRef];
      if (!approval) return null;
      checkGatewayApproval(approval);
      if (approval.status === "pending" && new Date(approval.expiresAt) <= this.#clock()) {
        approval.status = "expired";
        state.audit.push({ type: "approval.expired", approvalRef, recordedAt: this.#clock().toISOString() });
      }
      return approval;
    });
    return approvalView(result.result);
  }

  async verify({ approvalRef, request, capabilitySnapshot }) {
    const state = await this.#store.load();
    const approval = state.approvals[approvalRef];
    checkGatewayApproval(approval);
    if (!approval || approval.status !== "approved") return false;
    if (new Date(approval.expiresAt) <= this.#clock()) return false;
    if (approval.gatewayReview && (approval.requestKey !== request.idempotencyKey || !capabilitySnapshot || approval.gatewaySnapshot.sha256 !== capabilitySnapshot.sha256 ||
      !approval.humanProof || approval.humanProof.principalRef !== approval.approvedBy)) return false;
    return approval.actionFingerprint === actionFingerprint(request);
  }
}
