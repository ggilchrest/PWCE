// This is the compatibility pin for the intentionally small external-Agent fixture.
// Update it whenever the development gateway catalog changes.
export const fixtureGatewayProfile = Object.freeze({
  profileId: "pwce-agent-gateway.v1",
  profileVersion: "1.0.0",
  bundleId: "pwce-agent-gateway.bundle.v1",
  bundleVersion: "1.0.0",
  schemaStatus: "published",
  schemaDigest: "32c555ba675b61b4c1ec82245e314a8f6ca537484defbeb48b9fe1b6bdf4e2e2",
  operationCatalogVersion: "0.1.0",
  operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65",
  fixtureSetId: "pwce.shared.contract.vectors",
  fixtureSetVersion: "0.1.0",
  requiredOperations: Object.freeze(["context.query", "authority.getGrants", "health.get"])
});
