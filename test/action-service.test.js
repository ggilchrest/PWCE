import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/runtime/state-store.js";
import { FixtureActionTarget } from "../src/actions/fixture-target.js";
import { ActionService } from "../src/actions/action-service.js";
import { ApprovalService } from "../src/actions/approval-service.js";

function service(mode = "normal", target = new FixtureActionTarget({ mode })) {
  const store = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, audit: [] } });
  const actions = new ActionService({ store, target, clock: () => new Date("2026-09-06T12:00:10Z") });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  return { store, actions };
}

const request = (overrides = {}) => ({ principalRef: "agent.fixture", capabilityRef: "home.light.set_level", operation: "light.set_level", siteRef: "home.one", targetEntityId: "light.kitchen", parameters: { level: 0.4 }, executionEnvironmentRef: "test", idempotencyKey: "action-001", ...overrides });

test("exposes a bounded reversible capability snapshot", () => {
  const { actions } = service();
  const snapshot = actions.snapshot();
  assert.equal(snapshot.capabilities[0].effectClass, "reversible");
  assert.equal(snapshot.capabilities[0].authorization, "grant_required");
  assert.equal(snapshot.capabilities[0].idempotency, "required");
});

test("previews, admits, dispatches, and observes one reversible test action", async () => {
  const { actions } = service();
  assert.equal(actions.preview(request()).outcome, "allowed");
  const admission = await actions.authorizeDispatch(request());
  assert.equal(admission.action.status, "admitted");
  const result = await actions.dispatch(admission.action.actionRef);
  assert.equal(result.status, "succeeded");
  assert.equal(result.result.observed.value, 0.4);
});

test("prevents live routing and protects idempotent replay", async () => {
  const { actions } = service();
  assert.deepEqual(actions.preview(request({ executionEnvironmentRef: "live" })).rationaleCodes, ["live_route_not_activated"]);
  const first = await actions.authorizeDispatch(request());
  const second = await actions.authorizeDispatch(request());
  assert.equal(second.duplicate, true);
  assert.equal(first.action.actionRef, second.action.actionRef);
  await assert.rejects(() => actions.authorizeDispatch(request({ parameters: { level: 0.8 } })), (error) => error.code === "idempotency_conflict");
});

test("preserves timeout and unknown outcomes without claiming success", async () => {
  const timeout = service("timeout");
  const admittedTimeout = await timeout.actions.authorizeDispatch(request({ idempotencyKey: "timeout-001" }));
  assert.equal((await timeout.actions.dispatch(admittedTimeout.action.actionRef)).status, "timed_out");
  const unknown = service("unknown");
  const admittedUnknown = await unknown.actions.authorizeDispatch(request({ idempotencyKey: "unknown-001" }));
  assert.equal((await unknown.actions.dispatch(admittedUnknown.action.actionRef)).status, "outcome_unknown");
});

test("persists an unknown outcome when the target throws during dispatch", async () => {
  const target = { async invoke() { throw new Error("transport timed out"); } };
  const { actions } = service("normal", target);
  const admitted = await actions.authorizeDispatch(request({ idempotencyKey: "target-throw-001" }));
  const result = await actions.dispatch(admitted.action.actionRef);
  assert.equal(result.status, "outcome_unknown");
  assert.equal(result.result.externalEffectOccurred, "unknown");
  assert.equal(result.result.reasonCode, "target_invocation_failed");
  assert.equal((await actions.getInvocation(admitted.action.actionRef)).status, "outcome_unknown");
});

test("denies missing grants, invalid parameters, and missing idempotency", async () => {
  const { actions } = service();
  assert.deepEqual(actions.preview(request({ principalRef: "agent.other" })).rationaleCodes, ["grant_missing"]);
  assert.deepEqual(actions.preview(request({ parameters: { level: 2 } })).rationaleCodes, ["invalid_parameters"]);
  assert.deepEqual(actions.preview(request({ capabilityVersion: "2.0.0" })).rationaleCodes, ["capability_version_mismatch"]);
  assert.deepEqual((await actions.authorizeDispatch(request({ idempotencyKey: undefined }))).decision.rationaleCodes, ["idempotency_required"]);
});

test("requires local human approval for an approval-marked action", async () => {
  const stateStore = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } });
  const approvals = new ApprovalService({ store: stateStore, clock: () => new Date("2026-09-06T12:00:00Z") });
  const actions = new ActionService({ store: stateStore, target: new FixtureActionTarget(), approvalService: approvals, clock: () => new Date("2026-09-06T12:00:00Z") });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const gated = request({ approvalRequired: true, idempotencyKey: "approval-001" });
  assert.equal(actions.preview(gated).outcome, "approval_required");
  const pending = await approvals.request({ request: gated, requestedBy: "agent.fixture" });
  assert.equal((await actions.authorizeDispatch({ ...gated, approvalRef: pending.approvalRef })).action, null);
  await approvals.approve({ approvalRef: pending.approvalRef, approvedBy: "human.local" });
  const admitted = await actions.authorizeDispatch({ ...gated, approvalRef: pending.approvalRef });
  assert.equal(admitted.action.status, "admitted");
});

test("live effects require an explicit runtime enablement flag", async () => {
  const { actions } = service();
  assert.deepEqual(actions.preview(request({ executionEnvironmentRef: "live" })).rationaleCodes, ["live_route_not_activated"]);
  const enabled = new ActionService({ store: new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, projections: {}, actions: {}, approvals: {}, audit: [] } }), target: new FixtureActionTarget(), liveEffectsEnabled: true });
  enabled.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  assert.equal(enabled.preview(request({ executionEnvironmentRef: "live" })).outcome, "allowed");
});

test("restart preserves completed invocation and prevents a second target call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pwce-action-restart-"));
  const path = join(directory, "state.json");
  const firstTarget = { calls: 0, async invoke() { this.calls += 1; return { status: "succeeded", externalEffectOccurred: true }; } };
  const firstStore = new StateStore({ path });
  const first = new ActionService({ store: firstStore, target: firstTarget });
  first.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const admitted = await first.authorizeDispatch(request({ idempotencyKey: "restart-001" }));
  await first.dispatch(admitted.action.actionRef);
  assert.equal(firstTarget.calls, 1);

  const secondTarget = { calls: 0, async invoke() { this.calls += 1; return { status: "succeeded", externalEffectOccurred: true }; } };
  const secondStore = new StateStore({ path });
  const second = new ActionService({ store: secondStore, target: secondTarget });
  second.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const replay = await second.authorizeDispatch(request({ idempotencyKey: "restart-001" }));
  assert.equal(replay.duplicate, true);
  assert.equal((await second.getInvocation(admitted.action.actionRef)).status, "succeeded");
  assert.equal(secondTarget.calls, 0);
});

test("revalidates the grant before dispatch and prevents a revoked effect", async () => {
  const target = { calls: 0, async invoke() { this.calls += 1; return { status: "succeeded", externalEffectOccurred: true }; } };
  const store = new StateStore({ state: { schemaVersion: 1, worldRef: "world.personal.v1", revision: 0, sites: {}, sources: {}, entities: {}, observations: [], idempotencyKeys: {}, actions: {}, approvals: {}, audit: [] } });
  const actions = new ActionService({ store, target });
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const admitted = await actions.authorizeDispatch(request({ idempotencyKey: "revoked-before-dispatch" }));
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: [], capabilityRefs: [] });
  const result = await actions.dispatch(admitted.action.actionRef);
  assert.equal(result.status, "denied");
  assert.equal(result.reasonCode, "grant_changed_before_dispatch");
  assert.equal(target.calls, 0);
});

test("coalesces concurrent dispatch retries into one target call", async () => {
  let release;
  const target = { calls: 0, async invoke() { this.calls += 1; await new Promise((resolve) => { release = resolve; }); return { status: "succeeded", externalEffectOccurred: true }; } };
  const { actions } = service("normal", target);
  actions.registerGrant({ principalRef: "agent.fixture", siteRefs: ["home.one"], capabilityRefs: ["home.light.set_level"] });
  const admitted = await actions.authorizeDispatch(request({ idempotencyKey: "concurrent-dispatch" }));
  const first = actions.dispatch(admitted.action.actionRef);
  const second = actions.dispatch(admitted.action.actionRef);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(target.calls, 1);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].status, "succeeded");
  assert.equal(results[1].status, "succeeded");
});

test("serializes concurrent admissions for one idempotency key", async () => {
  const { actions } = service();
  const [first, second] = await Promise.all([
    actions.authorizeDispatch(request({ idempotencyKey: "concurrent-admission" })),
    actions.authorizeDispatch(request({ idempotencyKey: "concurrent-admission" }))
  ]);
  assert.equal(first.action.actionRef, second.action.actionRef);
  assert.equal([first.duplicate, second.duplicate].filter(Boolean).length, 1);
});
