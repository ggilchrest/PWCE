import { randomUUID } from "node:crypto";
import { canonicalize } from "../contract-foundation/canonical-json.js";

export function actionFingerprint(request) {
  return canonicalize({ principalRef: request.principalRef ?? null, capabilityRef: request.capabilityRef, capabilityVersion: request.capabilityVersion ?? null, operation: request.operation, siteRef: request.siteRef, targetEntityId: request.targetEntityId, parameters: request.parameters });
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

  async approve({ approvalRef, approvedBy }) {
    const result = await this.#store.transaction((state) => {
      const approval = state.approvals[approvalRef];
      if (!approval) throw new Error("approval not found");
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
      state.audit.push({ type: "approval.approved", approvalRef, approvedBy, recordedAt: approval.approvedAt });
      return { approval, expired: false };
    });
    if (result.result.expired) throw new Error("approval expired");
    return result.result.approval;
  }

  async verify({ approvalRef, request }) {
    const state = await this.#store.load();
    const approval = state.approvals[approvalRef];
    if (!approval || approval.status !== "approved") return false;
    if (new Date(approval.expiresAt) <= this.#clock()) return false;
    return approval.actionFingerprint === actionFingerprint(request);
  }
}
