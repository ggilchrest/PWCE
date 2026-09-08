import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const artifactPaths = [
  "contracts/gateway/operation-catalog.json",
  "contracts/gateway/pwce-agent-gateway-profile.schema.json",
  "contracts/gateway/pwce-agent-gateway-request.schema.json",
  "contracts/gateway/pwce-agent-gateway-response.schema.json",
  "contracts/gateway/pwce-lifestream-compatibility-lock.schema.json",
  "contracts/gateway/pwce-agent-gateway-authority-request.schema.json",
  "contracts/gateway/pwce-agent-gateway-authority-response.schema.json"
];
const manifestPath = "contracts/gateway/bundle-manifest.json";
const bundlePath = "src/gateway/gateway-bundle.js";
const clientPath = "src/gateway/generated-client.js";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifacts = [];
const aggregate = createHash("sha256");
for (const path of artifactPaths) {
  const bytes = await readFile(path);
  aggregate.update(path);
  aggregate.update("\0");
  aggregate.update(bytes);
  artifacts.push({ path, sha256: hash(bytes) });
}
const generatedClient = { path: "src/gateway/generated-client.js", status: "checked_in", sha256: hash(await readFile(clientPath)) };
const nextManifest = { ...manifest, artifacts, bundleDigest: aggregate.digest("hex"), generatedClient };
const bundleLines = [
  "export const gatewayBundle = Object.freeze({",
  `  bundleId: ${JSON.stringify(nextManifest.bundleId)},`,
  `  bundleVersion: ${JSON.stringify(nextManifest.bundleVersion)},`,
  `  bundleDigest: ${JSON.stringify(nextManifest.bundleDigest)},`,
  "  artifacts: Object.freeze([",
  artifacts.map((artifact) => `    Object.freeze({ path: ${JSON.stringify(artifact.path)}, sha256: ${JSON.stringify(artifact.sha256)} })`).join(",\n"),
  "  ]),",
  `  generatedClient: Object.freeze({ path: ${JSON.stringify(generatedClient.path)}, sha256: ${JSON.stringify(generatedClient.sha256)} })`,
  "});"
];
const bundleSource = `${bundleLines.join("\n")}\n`;
const expectedManifest = `${JSON.stringify(nextManifest, null, 2)}\n`;
const equal = await readFile(manifestPath, "utf8") === expectedManifest && await readFile(bundlePath, "utf8") === bundleSource;
console.log(JSON.stringify({ source: "public-contract-foundation", bundleId: nextManifest.bundleId, bundleVersion: nextManifest.bundleVersion, bundleDigest: nextManifest.bundleDigest, generatedClientSha256: generatedClient.sha256, byteIdentical: equal }, null, 2));
if (process.argv.includes("--write")) {
  await writeFile(manifestPath, expectedManifest);
  await writeFile(bundlePath, bundleSource);
} else if (!equal) {
  console.error("public gateway bundle is stale; run node scripts/generate-gateway-bundle.mjs --write");
  process.exitCode = 1;
}
