import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gatewayProfile } from "../src/gateway/gateway-service.js";
import { gatewayBundle } from "../src/gateway/gateway-bundle.js";

test("published gateway profile digest matches the checked-in bundle artifacts", async () => {
  const paths = [
    "contracts/gateway/operation-catalog.json",
    "contracts/gateway/pwce-agent-gateway-profile.schema.json",
    "contracts/gateway/pwce-agent-gateway-request.schema.json",
    "contracts/gateway/pwce-agent-gateway-response.schema.json"
  ];
  const digest = createHash("sha256");
  for (const path of paths) { digest.update(path); digest.update("\0"); digest.update(await readFile(path)); }
  const manifest = JSON.parse(await readFile("contracts/gateway/bundle-manifest.json", "utf8"));
  const catalog = JSON.parse(await readFile(paths[0], "utf8"));
  const catalogDigest = createHash("sha256").update(JSON.stringify(catalog.operations)).digest("hex");
  const clientDigest = createHash("sha256").update(await readFile("src/gateway/generated-client.js")).digest("hex");
  assert.equal(gatewayProfile.schemaStatus, "published");
  assert.equal(gatewayProfile.schemaDigest, digest.digest("hex"));
  assert.equal(gatewayBundle.bundleDigest, gatewayProfile.schemaDigest);
  assert.equal(gatewayProfile.operationCatalogDigest, catalogDigest);
  assert.equal(manifest.generatedClient.sha256, clientDigest);
});
