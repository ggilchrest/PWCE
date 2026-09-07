import test from "node:test";
import assert from "node:assert/strict";
import { loadFoundation, integrityValue, profile } from "../src/contract-foundation/contract-foundation.js";
import { validateEnvelope } from "../src/contract-foundation/envelope-validator.js";

test("pins the first implementation tier to the active Personal V1 profile", () => {
  assert.equal(profile.firstTier, "PV1-T0");
  assert.equal(profile.artifactIdentifier, "PWCE-PROFILE-PERSONAL-V1-001");
});

test("all supplied contract vectors match their declared envelope and integrity outcomes", async () => {
  const { fixtureSet } = await loadFoundation();
  for (const vector of fixtureSet.vectors) {
    assert.equal(validateEnvelope(vector.record).length === 0, vector.expectedEnvelopeValid, vector.id);
    assert.equal(vector.expectedIntegrityValid, integrityValue(vector.record) === vector.record.integrity.value, vector.id);
  }
});

test("rejects an envelope that has both World and platform scope", async () => {
  const { fixtureSet } = await loadFoundation();
  const record = structuredClone(fixtureSet.vectors.find((v) => v.id === "valid-platform-health").record);
  record.worldId = "018f0000-0000-7000-8000-000000000100";
  assert.match(validateEnvelope(record).join("\n"), /exactly one of worldId or platformScope/);
});

test("rejects an unknown envelope field", async () => {
  const { fixtureSet } = await loadFoundation();
  const record = structuredClone(fixtureSet.vectors.find((v) => v.id === "valid-world-observation").record);
  record.privateShortcut = true;
  assert.match(validateEnvelope(record).join("\n"), /unknown envelope field/);
});
