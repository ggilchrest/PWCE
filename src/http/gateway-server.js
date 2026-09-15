import { timingSafeEqual } from "node:crypto";
import { GatewayService, gatewayProfile } from "../gateway/gateway-service.js";
import { gatewayBundle } from "../gateway/gateway-bundle.js";
import { dispatchBundle } from "../gateway/dispatch-bundle.js";
import { validateDispatchRequest } from "./dispatch-contract.js";
import { validateAuthorityRequest } from "./gateway-contract.js";
import { MAX_TRANSPORT_BYTES, readJsonBody, readJsonObjectBody, requireJsonContentType } from "./json-body.js";
import { SECURITY_HEADERS } from "./security-headers.js";

function json(res, status, value) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_TRANSPORT_BYTES) {
    res.writeHead(500, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: { code: "limit_exceeded", message: "response body exceeds the 1 MiB transport limit" } }));
    return;
  }
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
  const writeEvent = (event) => {
    const frame = frameFor(event);
    if (Buffer.byteLength(frame, "utf8") > MAX_TRANSPORT_BYTES || res.write(frame) === false) throw new Error("event stream cannot keep up");
  };
  if (result.resyncRequired) res.write(`event: resync.required\ndata: ${JSON.stringify({ reason: result.resyncReason ?? "cursor_expired" })}\n\n`);
  for (const event of result.events) writeEvent(event);
  res.write(": gateway-replay\n\n");
  return writeEvent;
}

export function createGatewayHttpBinding({ store, token, dispatcherToken = null, principalRef = "agent.fixture", siteRefs = ["home.one"], actionService = null, gateway = null } = {}) {
  if (dispatcherToken !== null && (typeof dispatcherToken !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(dispatcherToken) || !token || sameSecret(dispatcherToken, token))) throw new Error('trusted dispatcher requires a distinct host secret and configured Agent authentication');
  gateway ??= new GatewayService({ store, actionService });
  if (token) gateway.registerPrincipal({ principalRef, token, siteRefs });
  return {
    gateway,
    async handle(req, res, pathname) {
      if (!pathname.startsWith("/gateway/v1/")) return false;
      if (!token) { json(res, 503, gatewayError("gateway_token_not_configured")); return true; }
      const presentedToken = bearer(req);
      if (pathname === '/gateway/v1/dispatch' || pathname === '/gateway/v1/dispatch/bundle') {
        if (!dispatcherToken) { json(res, 503, gatewayError('trusted_dispatch_not_configured')); return true; }
        if (!sameSecret(presentedToken, token) || !sameSecret(req.headers['x-pwce-dispatcher-token'], dispatcherToken)) { json(res, 401, gatewayError('authentication_failed')); return true; }
        if (req.headers.origin !== undefined) { json(res, 403, gatewayError('trusted_dispatch_browser_forbidden')); return true; }
        if (pathname.endsWith('/bundle')) {
          json(res, req.method === 'GET' ? 200 : 405, req.method === 'GET' ? dispatchBundle : gatewayError('method_not_allowed')); return true;
        }
        if (req.method !== 'POST') { json(res, 405, gatewayError('method_not_allowed')); return true; }
        if (req.headers['x-pwce-dispatch-contract'] !== dispatchBundle.bundleDigest) { json(res, 409, gatewayError('incompatible_dispatch_contract')); return true; }
        try {
          requireJsonContentType(req);
          const request = validateDispatchRequest(await readJsonObjectBody(req));
          const result = await gateway.requestTrustedDispatch({ ...request, token: presentedToken });
          json(res, 200, { ...result, dispatchProfileId: dispatchBundle.dispatchProfileId, dispatchProfileVersion: dispatchBundle.dispatchProfileVersion });
        } catch (error) { json(res, authError(error), gatewayError(error.code ?? 'gateway_request_failed', error.message)); }
        return true;
      }
      if (req.method === "GET" && pathname === "/gateway/v1/profile") {
        if (!sameSecret(presentedToken, token)) { json(res, 401, gatewayError("authentication_failed", "authentication failed")); return true; }
        return json(res, 200, gatewayProfile), true;
      }
      if (req.method === "GET" && pathname === "/gateway/v1/bundle") {
        if (!sameSecret(presentedToken, token)) { json(res, 401, gatewayError("authentication_failed", "authentication failed")); return true; }
        return json(res, 200, gatewayBundle), true;
      }
      if (req.method === "GET" && pathname === "/gateway/v1/events") {
        let started = false;
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          const fields = new Set(["authorityContextRef", "siteRef", "afterCursor", "limit", "profileId", "profileVersion", "requestId", "correlationId", "worldRef", "executionEnvironmentRef", "deadline", "assistantRef", "endpointRef", "participantRefs", "audienceRef"]);
          if (Buffer.byteLength(url.search, "utf8") > 16_384 || [...url.searchParams.keys()].some(key => !fields.has(key) || url.searchParams.getAll(key).length !== 1)) {
            const error = new Error("event subscription query is invalid or too large"); error.code = "invalid_request"; throw error;
          }
          const request = Object.fromEntries(url.searchParams);
          if (request.participantRefs !== undefined) {
            try { request.participantRefs = JSON.parse(request.participantRefs); }
            catch { const error = new Error("participantRefs must be a JSON list"); error.code = "invalid_request"; throw error; }
          }
          request.limit = Number(request.limit ?? 100);
          request.operation = "events.subscribe";
          let writeEvent;
          const close = await gateway.openEventStream({ token: presentedToken, request,
            onReplay(result) { writeEvent = sse(res, result); started = true; },
            onEvent(event) { writeEvent(event); },
            onClose(reason) {
              if (started && !res.writableEnded && !res.destroyed) res.write(`event: resync.required\ndata: ${JSON.stringify({ reason })}\n\n`);
              if (started || res.headersSent) res.end();
            }
          });
          if (typeof res.on !== "function") { close(); return true; }
          res.on("close", () => close("stream_disconnected"));
          if (res.destroyed) close("stream_disconnected");
          return true;
        } catch (error) {
          if (started || res.headersSent) res.end();
          else json(res, authError(error), { error: { code: error.code ?? "gateway_request_failed", message: error.message } });
          return true;
        }
      }
      if (req.method !== "POST") { json(res, 405, gatewayError("method_not_allowed")); return true; }
      try {
        requireJsonContentType(req);
        if (pathname === "/gateway/v1/authority") {
          if (!sameSecret(presentedToken, token)) throw new Error("authentication failed");
          const payload = validateAuthorityRequest(await readJsonBody(req));
          return json(res, 201, gateway.issueAuthorityContext({ principalRef, token: presentedToken, siteRefs: payload.siteRefs, ttlMs: payload.ttlMs, assistantRef: payload.assistantRef, endpointRef: payload.endpointRef, participantRefs: payload.participantRefs, audienceRef: payload.audienceRef })), true;
        }
        if (pathname === "/gateway/v1/request") {
          const payload = await readJsonObjectBody(req);
          if (Object.hasOwn(payload, "token")) {
            const error = new Error("gateway credentials belong in the Authorization header");
            error.code = "invalid_request";
            throw error;
          }
          const result = await gateway.requestAuthenticated({ ...payload, token: presentedToken });
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
