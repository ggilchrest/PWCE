import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize } from "./canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const privateRoot = resolve(root, ".private");

export const profile = {
  artifactIdentifier: "PWCE-PROFILE-PERSONAL-V1-001",
  version: "0.1.0",
  status: "Active working profile",
  firstTier: "PV1-T0"
};

export const paths = {
  manifest: resolve(privateRoot, "contracts/pwce-contract-manifest.json"),
  envelopeSchema: resolve(privateRoot, "contracts/pwce-envelope.schema.json"),
  fixtureSet: resolve(privateRoot, "fixtures/pwce-shared-contract-vectors.json")
};

export async function loadFoundation() {
  const [manifest, envelopeSchema, fixtureSet] = await Promise.all(
    [paths.manifest, paths.envelopeSchema, paths.fixtureSet].map(async (path) => JSON.parse(await readFile(path, "utf8")))
  );
  return { manifest, envelopeSchema, fixtureSet };
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function integrityValue(record) {
  const withoutValue = structuredClone(record);
  delete withoutValue.integrity.value;
  return sha256Bytes(canonicalize(withoutValue));
}

export async function verifyManifest(manifest) {
  const results = [];
  for (const entry of manifest.files) {
    const path = resolve(privateRoot, "contracts", entry.path);
    const bytes = await readFile(path);
    results.push({
      path: entry.path,
      expected: entry.sha256,
      actual: sha256Bytes(bytes),
      matches: entry.sha256 === sha256Bytes(bytes)
    });
  }
  return results;
}
