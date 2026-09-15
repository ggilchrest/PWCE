const capabilities = new Map([
  ["home.light.set_level", { capabilityRef: "home.light.set_level", operation: "light.set_level", effectClass: "reversible", approval: "policy", idempotency: "required", offline: "fixture_only", schemaVersion: "1.0.0" }]
]);
export function capabilityFor(request) {
  return capabilities.get(request.capabilityRef);
}

export function capabilitySnapshot() {
  return [...capabilities.values()].map((capability) => ({ ...capability, available: true, authorization: "grant_required" }));
}
