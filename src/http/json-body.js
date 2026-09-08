export const MAX_TRANSPORT_BYTES = 1_048_576;

export function requireJsonContentType(req) {
  const contentType = req.headers?.["content-type"]?.split(";", 1)[0].trim().toLowerCase()
    ?? req.headers?.["Content-Type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    const error = new Error("JSON requests require application/json content type");
    error.code = "invalid_request";
    throw error;
  }
}

function limitError(message) {
  const error = new Error(message);
  error.code = "limit_exceeded";
  return error;
}

export async function readJsonBody(req) {
  const declaredLength = Number(req.headers?.["content-length"] ?? req.headers?.["Content-Length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRANSPORT_BYTES) throw limitError("request body exceeds the 1 MiB transport limit");
  let text = "";
  let byteLength = 0;
  for await (const chunk of req) {
    byteLength += Buffer.byteLength(chunk);
    if (byteLength > MAX_TRANSPORT_BYTES) throw limitError("request body exceeds the 1 MiB transport limit");
    text += chunk;
  }
  if (!text) return {};
  try { return JSON.parse(text); } catch {
    const error = new Error("request body must be valid JSON");
    error.code = "invalid_request";
    throw error;
  }
}
