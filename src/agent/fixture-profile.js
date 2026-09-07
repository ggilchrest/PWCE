// This is the compatibility pin for the intentionally small external-Agent fixture.
// Update it whenever the development gateway catalog changes.
export const fixtureGatewayProfile = Object.freeze({
  profileId: "pwce-agent-gateway.v1",
  profileVersion: "1.0.0",
  bundleId: "pwce-agent-gateway.bundle.v1",
  bundleVersion: "1.0.0",
  schemaStatus: "published",
  schemaDigest: "2eb0c47b65cc254edf09b2893fab1eb36e00142eb361649798bec65c2f08fe11",
  operationCatalogVersion: "0.1.0",
  operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65",
  fixtureSetId: "pwce.shared.contract.vectors",
  fixtureSetVersion: "0.1.0",
  requiredOperations: Object.freeze(["context.query", "authority.getGrants", "health.get"])
});
