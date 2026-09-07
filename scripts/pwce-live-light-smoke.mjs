import { StateStore } from "../src/runtime/state-store.js";
import { HomeAssistantAdapter } from "../src/adapters/home-assistant-adapter.js";
import { HomeAssistantActionTarget } from "../src/actions/home-assistant-target.js";
import { ActionService } from "../src/actions/action-service.js";
import { ApprovalService } from "../src/actions/approval-service.js";
import { homeAssistantConfigFromEnv, resolveSecretReference } from "../src/config/home-assistant-config.js";

const entity = process.env.PWCE_HA_SMOKE_ENTITY ?? "light.kitchen_lights";
const execute = process.argv.includes("--execute");
const config = homeAssistantConfigFromEnv();
const store = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
const adapter = new HomeAssistantAdapter({ store, config, resolveToken: (reference) => resolveSecretReference(reference) });
const before = await adapter.getState(entity);
const originalLevel = typeof before.rawAttributes?.brightness === "number" ? before.rawAttributes.brightness / 255 : before.value === "off" ? 0 : null;
if (originalLevel === null) throw new Error("cannot safely determine the original light level; refusing to execute");

if (!execute) {
  console.log(JSON.stringify({ mode: "read_only", entity, state: before.value, originalLevel }));
  process.exit(0);
}

const target = new HomeAssistantActionTarget({ adapter });
const approvals = new ApprovalService({ store });
const actions = new ActionService({ store, target, approvalService: approvals, liveEffectsEnabled: true });
actions.registerGrant({ principalRef: "agent.fixture", siteRefs: [config.siteRef], capabilityRefs: ["home.light.set_level"] });

async function executeLevel(level, idempotencyKey) {
  const request = { principalRef: "agent.fixture", capabilityRef: "home.light.set_level", operation: "light.set_level", siteRef: config.siteRef, targetEntityId: entity, parameters: { level }, executionEnvironmentRef: "live", approvalRequired: true, idempotencyKey };
  const pending = await approvals.request({ request, requestedBy: "agent.fixture", expiresInMs: 120_000 });
  await approvals.approve({ approvalRef: pending.approvalRef, approvedBy: "human.local" });
  const admission = await actions.authorizeDispatch({ ...request, approvalRef: pending.approvalRef });
  if (!admission.action) throw new Error(`action denied: ${JSON.stringify(admission.decision)}`);
  const dispatch = await actions.dispatch(admission.action.actionRef);
  let reconciliation;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    reconciliation = await actions.reconcile(admission.action.actionRef);
    if (reconciliation.status === "succeeded") break;
  }
  return { level, dispatchStatus: dispatch.status, reconcileStatus: reconciliation.status, observed: reconciliation.observed };
}

const testResult = await executeLevel(0.4, "live-light-smoke-test");
const restoreResult = await executeLevel(originalLevel, "live-light-smoke-restore");
console.log(JSON.stringify({ mode: "executed", entity, originalLevel, testResult, restoreResult }));
