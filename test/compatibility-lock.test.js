import test from "node:test";
import assert from "node:assert/strict";
import { assertCompatibilityLock, validateCompatibilityLock } from "../src/gateway/compatibility-lock.js";

function draftLock() {
  return {
    lockVersion: "0.1.0",
    pwceBundle: { bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", bundleDigest: "2eb0c47b65cc254edf09b2893fab1eb36e00142eb361649798bec65c2f08fe11" },
    pwceProfile: { profileId: "pwce-agent-gateway.v1", profileVersion: "1.0.0", bundleId: "pwce-agent-gateway.bundle.v1", bundleVersion: "1.0.0", schemaStatus: "published", schemaDigest: "2eb0c47b65cc254edf09b2893fab1eb36e00142eb361649798bec65c2f08fe11", operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65", fixtures: [{ fixtureSetId: "pwce.shared.contract.vectors", fixtureSetVersion: "0.1.0", status: "published" }] },
    lifestreamProfile: { profileId: "lifestream-pwce.v1", profileVersion: "1.0.0", schemaStatus: "unpublished", schemaDigest: "lifestream-schema", operationCatalogDigest: "lifestream-catalog", fixtures: ["lifestream-fixtures"] },
    adapterRevision: "adapter-rev",
    environment: "development",
    requiredOperations: ["context.query", "health.get"],
    results: [{ target: "fixture", status: "pass" }, { target: "real_gateway", status: "pass" }]
  };
}

test("compatibility lock fails closed while the selected Lifestream schema is unpublished", () => {
  const errors = validateCompatibilityLock(draftLock());
  assert.ok(errors.includes("lifestreamProfile.schemaStatus is not published"));
  assert.throws(() => assertCompatibilityLock(draftLock()), { code: "incompatible_compatibility_lock" });
});

test("compatibility lock reports missing cross-repository evidence", () => {
  const errors = validateCompatibilityLock({ lockVersion: "0.1.0", pwceProfile: {}, lifestreamProfile: {} });
  assert.ok(errors.includes("pwceBundle is required"));
  assert.ok(errors.some((error) => error.startsWith("lifestreamProfile.profileVersion")));
  assert.ok(errors.some((error) => error.startsWith("pwceProfile.schemaDigest")));
  assert.ok(errors.some((error) => error.startsWith("lifestreamProfile.schemaDigest")));
  assert.ok(errors.includes("adapterRevision must be a non-empty string"));
  assert.ok(errors.includes("results must be a non-empty array"));
});

test("compatibility lock rejects a PWCE digest that is merely well-formed", () => {
  const lock = draftLock();
  lock.pwceProfile.schemaDigest = "f".repeat(64);
  const errors = validateCompatibilityLock(lock);
  assert.ok(errors.includes("pwceProfile.schemaDigest does not match the selected PWCE profile"));
});
