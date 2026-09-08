import { timingSafeEqual } from "node:crypto";
import { GatewayService, gatewayProfile } from "../gateway/gateway-service.js";
import { gatewayBundle } from "../gateway/gateway-bundle.js";
import { validateAuthorityRequest } from "./gateway-contract.js";
import { MAX_TRANSPORT_BYTES, readJsonBody } from "./json-body.js";

function json(res, status, value) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_TRANSPORT_BYTES) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: { code: "limit_exceeded", message: "response body exceeds the 1 MiB transport limit" } }));
    return;
  }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(encoded);
}

function gatewayError(code, message = code) {
  return { error: { code, message } };
}

function bearer(req) {
  return req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice("Bearer ".length) : null;
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authError(error) {
  if (["authentication_failed", "authority_context_expired", "authority_context_invalidated"].includes(error.code) || error.code === undefined && /authentication failed|authority context expired|authority context invalidated/i.test(error.message)) return 401;
  if (["scope_denied", "authority_scope_denied"].includes(error.code)) return 403;
  return 400;
}

function sse(res, result) {
  const frameFor = (event) => `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  if (result.events.some((event) => Buffer.byteLength(frameFor(event), "utf8") > MAX_TRANSPORT_BYTES)) {
    const error = new Error("event stream frame exceeds the 1 MiB transport limit");
    error.code = "limit_exceeded";
    throw error;
  }
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
  const writeEvent = (event) => {
    const frame = frameFor(event);
    if (Buffer.byteLength(frame, "utf8") > MAX_TRANSPORT_BYTES) { res.end(); return; }
    return res.write(frame);
  };
  if (result.resyncRequired) res.write("event: resync.required\ndata: {\"reason\":\"cursor_expired\"}\n\n");
  for (const event of result.events) writeEvent(event);
  res.write(": gateway-replay\n\n");
  return writeEvent;
}

export function createGatewayHttpBinding({ store, token, principalRef = "agent.fixture", siteRefs = ["home.one"], actionService = null, gateway = new GatewayService({ store, actionService }) } = {}) {
  if (token) gateway.registerPrincipal({ principalRef, token, siteRefs });
  return {
    gateway,
    async handle(req, res, pathname) {
      if (!pathname.startsWith("/gateway/v1/")) return false;
      if (!token) { json(res, 503, gatewayError("gateway_token_not_configured")); return true; }
      const presentedToken = bearer(req);
      if (req.method === "GET" && pathname === "/gateway/v1/profile") {
        if (!sameSecret(presentedToken, token)) { json(res, 401, gatewayError("authentication_failed", "authentication failed")); return true; }
        return json(res, 200, gatewayProfile), true;
      }
      if (req.method === "GET" && pathname === "/gateway/v1/bundle") {
        if (!sameSecret(presentedToken, token)) { json(res, 401, gatewayError("authentication_failed", "authentication failed")); return true; }
        return json(res, 200, gatewayBundle), true;
      }
      if (req.method === "GET" && pathname === "/gateway/v1/events") {
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          const result = await gateway.requestAuthenticated({ token: presentedToken, operation: "events.subscribe", authorityContextRef: url.searchParams.get("authorityContextRef"), siteRef: url.searchParams.get("siteRef"), afterCursor: url.searchParams.get("afterCursor") ?? "0", limit: Number(url.searchParams.get("limit") ?? 100) });
          const writeEvent = sse(res, result);
          if (typeof req.on !== "function") { res.end(); return true; }
          const afterCursor = result.nextCursor;
          const close = gateway.openEventStream({ siteRef: result.siteRef, principalRef: result.principalRef, afterCursor, onEvent: writeEvent });
          const timeout = setTimeout(() => { close(); res.end(); }, 30_000);
          timeout.unref?.();
          req.on("close", () => { clearTimeout(timeout); close(); });
          return true;
        } catch (error) {
          json(res, authError(error), { error: { code: error.code ?? "gateway_request_failed", message: error.message } });
          return true;
        }
      }
      if (req.method !== "POST") { json(res, 405, gatewayError("method_not_allowed")); return true; }
      try {
        if (pathname === "/gateway/v1/authority") {
          if (!sameSecret(presentedToken, token)) throw new Error("authentication failed");
          const payload = validateAuthorityRequest(await readJsonBody(req));
          return json(res, 201, gateway.issueAuthorityContext({ principalRef, token: presentedToken, siteRefs: payload.siteRefs, ttlMs: payload.ttlMs, assistantRef: payload.assistantRef, endpointRef: payload.endpointRef, participantRefs: payload.participantRefs, audienceRef: payload.audienceRef })), true;
        }
        if (pathname === "/gateway/v1/request") {
          const payload = await readJsonBody(req);
          const result = await gateway.requestAuthenticated({ token: presentedToken, ...payload });
          return json(res, 200, result), true;
        }
        json(res, 404, gatewayError("gateway_route_not_found"));
        return true;
      } catch (error) {
        json(res, authError(error), { error: { code: error.code ?? "gateway_request_failed", message: error.message } });
        return true;
      }
    }
  };
}
