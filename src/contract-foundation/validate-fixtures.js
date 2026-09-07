import { loadFoundation, verifyManifest, integrityValue, profile } from "./contract-foundation.js";
import { validateEnvelope } from "./envelope-validator.js";

const { manifest, fixtureSet } = await loadFoundation();
const manifestResults = await verifyManifest(manifest);
const failures = [];
for (const result of manifestResults) if (!result.matches) failures.push(`manifest digest mismatch: ${result.path}`);
for (const vector of fixtureSet.vectors) {
  const envelopeErrors = validateEnvelope(vector.record);
  const envelopeValid = envelopeErrors.length === 0;
  const integrityValid = integrityValue(vector.record) === vector.record.integrity.value;
  if (envelopeValid !== vector.expectedEnvelopeValid) failures.push(`${vector.id}: expected envelope ${vector.expectedEnvelopeValid}, got ${envelopeValid} (${envelopeErrors.join("; ")})`);
  if (integrityValid !== vector.expectedIntegrityValid) failures.push(`${vector.id}: expected integrity ${vector.expectedIntegrityValid}, got ${integrityValid}`);
}
const summary = { tier: profile.firstTier, profile: `${profile.artifactIdentifier}@${profile.version}`, fixtureCount: fixtureSet.vectors.length, manifestChecks: manifestResults.length, failures };
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
