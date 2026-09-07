import { gatewayProfile } from "./gateway-service.js";
import { gatewayBundle } from "./gateway-bundle.js";
import { fixtureGatewayProfile } from "../agent/fixture-profile.js";

const requiredString = (value, path, errors) => {
  if (typeof value !== "string" || value.length === 0) errors.push(`${path} must be a non-empty string`);
};

const requiredArray = (value, path, errors) => {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${path} must be a non-empty array`);
};

function validateProfile(lockProfile, expected, path, errors) {
  if (!lockProfile || typeof lockProfile !== "object") {
    errors.push(`${path} is required`);
    return;
  }
  if (lockProfile.profileId !== expected.profileId) errors.push(`${path}.profileId does not match the selected PWCE profile`);
  requiredString(lockProfile.profileVersion, `${path}.profileVersion`, errors);
  if (expected.profileVersion && lockProfile.profileVersion !== expected.profileVersion) errors.push(`${path}.profileVersion does not match the selected PWCE profile`);
  if (lockProfile.schemaStatus !== "published") errors.push(`${path}.schemaStatus is not published`);
  requiredString(lockProfile.schemaDigest, `${path}.schemaDigest`, errors);
  requiredString(lockProfile.operationCatalogDigest, `${path}.operationCatalogDigest`, errors);
  requiredArray(lockProfile.fixtures, `${path}.fixtures`, errors);
}

export function validateCompatibilityLock(lock) {
  const errors = [];
  if (!lock || typeof lock !== "object") return ["lock must be an object"];
  requiredString(lock.lockVersion, "lockVersion", errors);
  if (!lock.pwceBundle || typeof lock.pwceBundle !== "object") errors.push("pwceBundle is required");
  else {
    for (const key of ["bundleId", "bundleVersion", "bundleDigest"]) requiredString(lock.pwceBundle[key], `pwceBundle.${key}`, errors);
    if (lock.pwceBundle.bundleId !== gatewayBundle.bundleId) errors.push("pwceBundle.bundleId does not match the published PWCE bundle");
    if (lock.pwceBundle.bundleVersion !== gatewayBundle.bundleVersion) errors.push("pwceBundle.bundleVersion does not match the published PWCE bundle");
    if (lock.pwceBundle.bundleDigest !== gatewayBundle.bundleDigest) errors.push("pwceBundle.bundleDigest does not match the published PWCE bundle");
  }
  validateProfile(lock.pwceProfile, gatewayProfile, "pwceProfile", errors);
  validateProfile(lock.lifestreamProfile, { profileId: "lifestream-pwce.v1" }, "lifestreamProfile", errors);
  requiredString(lock.adapterRevision, "adapterRevision", errors);
  requiredString(lock.environment, "environment", errors);
  requiredArray(lock.requiredOperations, "requiredOperations", errors);
  requiredArray(lock.results, "results", errors);

  if (Array.isArray(lock.requiredOperations)) {
    const selectedOperations = new Set(gatewayProfile.operationCatalog.map((entry) => entry.operation));
    for (const operation of lock.requiredOperations) {
      if (typeof operation !== "string" || !selectedOperations.has(operation)) errors.push(`requiredOperations contains an unsupported PWCE operation: ${String(operation)}`);
    }
  }
  if (gatewayProfile.schemaStatus !== "published") errors.push("selected PWCE gateway schema is not published");
  if (fixtureGatewayProfile.schemaStatus !== "published") errors.push("fixture Agent schema compatibility is not published");
  return errors;
}

export function assertCompatibilityLock(lock) {
  const errors = validateCompatibilityLock(lock);
  if (errors.length) {
    const error = new Error(`incompatible compatibility lock: ${errors.join("; ")}`);
    error.code = "incompatible_compatibility_lock";
    error.errors = errors;
    throw error;
  }
  return lock;
}
