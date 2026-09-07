// This is the compatibility pin for the intentionally small external-Agent fixture.
// Update it whenever the development gateway catalog changes.
export const fixtureGatewayProfile = Object.freeze({
  profileId: "pwce-agent-gateway.v1",
  profileVersion: "1.0.0",
  bundleId: "pwce-agent-gateway.bundle.v1",
  bundleVersion: "1.0.0",
  schemaStatus: "published",
  schemaDigest: "3af96275bc26754a8cebc64febb10b5ca50c951fd5003f106e06cfda846d4d3b",
  operationCatalogVersion: "0.1.0",
  operationCatalogDigest: "445cb4e4b9811a26a41c5821c7d68b09f377b69d24d42ec6dcd0acec5d950b65",
  fixtureSetId: "pwce.shared.contract.vectors",
  fixtureSetVersion: "0.1.0",
  requiredOperations: Object.freeze(["context.query", "authority.getGrants", "health.get"])
});
