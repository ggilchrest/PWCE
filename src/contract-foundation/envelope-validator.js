const recordKinds = new Set(["observation", "assertion", "decision", "command", "feedback", "result", "health", "correction", "request", "event"]);
const environmentClasses = new Set(["live", "replay", "simulated", "test", "dry_run"]);
const executionModes = new Set(["normal", "replay", "simulation", "dry_run"]);
const classifications = new Set(["public", "internal", "private", "sensitive", "restricted"]);
const opaqueId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const namespaced = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;

function required(record, key, errors) {
  if (!(key in record)) errors.push(`missing required field: ${key}`);
}

export function validateEnvelope(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["envelope must be an object"];
  for (const key of ["recordId", "recordKind", "schemaId", "schemaVersion", "producerId", "recordedAt", "environment", "correlationId", "provenance", "dataClassification", "retentionPolicyRef", "integrity", "payload"]) required(record, key, errors);
  const allowed = new Set(["recordId", "recordKind", "worldId", "platformScope", "schemaId", "schemaVersion", "producerId", "sourceId", "recordedAt", "ingestedAt", "eventTime", "validity", "environment", "correlationId", "causationRefs", "subjectRefs", "provenance", "dataClassification", "retentionPolicyRef", "integrity", "payload"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) errors.push(`unknown envelope field: ${key}`);
  if (record.worldId !== undefined && !opaqueId.test(record.worldId)) errors.push("worldId must be an opaque UUID");
  if (record.platformScope !== undefined && record.platformScope !== "platform") errors.push("platformScope must be platform");
  if ((record.worldId === undefined) === (record.platformScope === undefined)) errors.push("exactly one of worldId or platformScope is required");
  if (record.recordId !== undefined && !opaqueId.test(record.recordId)) errors.push("recordId must be an opaque UUID");
  if (record.producerId !== undefined && !opaqueId.test(record.producerId)) errors.push("producerId must be an opaque UUID");
  if (record.correlationId !== undefined && !opaqueId.test(record.correlationId)) errors.push("correlationId must be an opaque UUID");
  if (record.recordKind !== undefined && !recordKinds.has(record.recordKind)) errors.push(`unsupported recordKind: ${record.recordKind}`);
  if (record.schemaId !== undefined && !namespaced.test(record.schemaId)) errors.push("schemaId must be namespaced");
  if (record.retentionPolicyRef !== undefined && !namespaced.test(record.retentionPolicyRef)) errors.push("retentionPolicyRef must be namespaced");
  if (record.schemaVersion !== undefined && !semver.test(record.schemaVersion)) errors.push("schemaVersion must be semver");
  for (const key of ["recordedAt", "ingestedAt", "eventTime"]) if (record[key] !== undefined && !utc.test(record[key])) errors.push(`${key} must be a UTC timestamp`);
  if (record.dataClassification !== undefined && !classifications.has(record.dataClassification)) errors.push("invalid dataClassification");
  if (!record.environment || typeof record.environment !== "object") errors.push("environment must be an object");
  else {
    for (const key of ["environmentId", "environmentClass", "executionMode"]) if (!(key in record.environment)) errors.push(`missing environment field: ${key}`);
    if (record.environment.environmentId !== undefined && !opaqueId.test(record.environment.environmentId)) errors.push("environmentId must be an opaque UUID");
    if (record.environment.environmentClass !== undefined && !environmentClasses.has(record.environment.environmentClass)) errors.push("invalid environmentClass");
    if (record.environment.executionMode !== undefined && !executionModes.has(record.environment.executionMode)) errors.push("invalid executionMode");
  }
  if (!record.integrity || typeof record.integrity !== "object") errors.push("integrity must be an object");
  else for (const key of ["schemeId", "schemeVersion", "covers", "value"]) if (!(key in record.integrity)) errors.push(`missing integrity field: ${key}`);
  if (!record.provenance || typeof record.provenance !== "object") errors.push("provenance must be an object");
  return errors;
}
