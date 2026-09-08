const AUTHORITY_FIELDS = new Set(["siteRefs", "ttlMs", "assistantRef", "endpointRef", "participantRefs", "audienceRef"]);

function invalid(message) {
  const error = new Error(message);
  error.code = "invalid_request";
  return error;
}

function boundedIdentity(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw invalid(`${label} must be a bounded string`);
}

function boundedIdentityList(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length < 1 || item.length > 128)) throw invalid(`${label} must be a bounded list of strings`);
  if (new Set(value).size !== value.length) throw invalid(`${label} must not contain duplicate values`);
}

export function validateAuthorityRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid("authority request must be an object");
  const unknown = Object.keys(payload).find((key) => !AUTHORITY_FIELDS.has(key));
  if (unknown) throw invalid(`authority request contains unknown field: ${unknown}`);
  if (!Array.isArray(payload.siteRefs) || payload.siteRefs.length < 1) throw invalid("siteRefs must be a non-empty list");
  boundedIdentityList(payload.siteRefs, "siteRefs", 128);
  if (payload.ttlMs !== undefined && (!Number.isInteger(payload.ttlMs) || payload.ttlMs < 1 || payload.ttlMs > 3_600_000)) throw invalid("ttlMs outside allowed range");
  for (const [key, label] of [["assistantRef", "assistantRef"], ["endpointRef", "endpointRef"], ["audienceRef", "audienceRef"]]) {
    if (payload[key] !== undefined) boundedIdentity(payload[key], label, { nullable: true });
  }
  if (payload.participantRefs !== undefined) boundedIdentityList(payload.participantRefs, "participantRefs", 32);
  return payload;
}
