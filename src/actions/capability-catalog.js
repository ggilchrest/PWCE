import { capabilityContracts } from "./capability-contracts.js";

const capabilities = new Map(capabilityContracts.capabilities.map(capability => [capability.capabilityRef, capability]));
export function capabilityFor(request) {
  return capabilities.get(request.capabilityRef);
}

export function capabilitySnapshot() {
  return [...capabilities.values()].map((capability) => ({ ...capability, available: true, authorization: "grant_required" }));
}
