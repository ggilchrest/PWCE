import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StateStore } from "../runtime/state-store.js";
import { getHealth } from "../runtime/health.js";
import { getCurrent, getCurrentAggregate } from "../domain/observation-service.js";
import { queryHistory, explainCurrent } from "../domain/query-service.js";
import { createStudioService } from "../studio/studio-service.js";
import { createStudioAuthService, createStudioSessionRegistry, getStudioContext, isAllowedStudioOrigin, parseCookies } from "./studio-auth.js";
import { createGatewayHttpBinding } from "./gateway-server.js";
import { MAX_TRANSPORT_BYTES, readJsonObjectBody, requireJsonContentType } from "./json-body.js";
import { BasicAgent } from "../agent/basic-agent.js";
import { SECURITY_HEADERS } from "./security-headers.js";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const studioRoot = join(root, "src", "studio");
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function json(res, status, value) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_TRANSPORT_BYTES) {
    res.writeHead(500, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ error: { code: "limit_exceeded", message: "response body exceeds the 1 MiB transport limit" } }));
  }
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(encoded);
}

export function errorPayload(message, code) {
  return { error: message, code: code ?? message };
}

export function issueStudioSession({ authorization, configuredToken, sessions, siteRefs, requiresHumanAuth = false }) {
  const bootstrapContext = getStudioContext({ authorization, configuredToken, sessions, siteRefs });
  if ((configuredToken || requiresHumanAuth) && !bootstrapContext) {
    const error = new Error("studio_authentication_required");
    error.code = "authentication_required";
    error.statusCode = 401;
    throw error;
  }
  const session = sessions.issue({ principalRef: bootstrapContext?.principalRef ?? "principal.studio", siteRefs: bootstrapContext?.siteRefs ?? siteRefs });
  return { session, transport: bootstrapContext ? "bearer_bootstrap" : "local_session" };
}

function requestFromPayload(payload, service) {
  return {
    ...payload,
    principalRef: payload.principalRef ?? "principal.studio",
    capabilityRef: payload.capabilityRef ?? "home.light.set_level",
    operation: payload.operation ?? "light.set_level",
    siteRef: payload.siteRef ?? service.siteRef,
    targetEntityId: payload.targetEntityId ?? service.entityId,
    executionEnvironmentRef: payload.executionEnvironmentRef ?? "live",
    idempotencyKey: payload.idempotencyKey ?? `studio-${Date.now()}`,
    approvalRequired: payload.executionEnvironmentRef === "live" ? true : (payload.approvalRequired ?? true)
  };
}

export async function listAuthorizedSites({ store, siteRefs }) {
  const state = await store.load();
  return siteRefs.map((siteRef) => ({ siteRef, name: state.sites[siteRef]?.name ?? siteRef, sources: Object.values(state.sources).filter((source) => source.siteRef === siteRef).map((source) => ({ sourceRef: source.sourceRef, status: source.status, lastStatusReason: source.lastStatusReason ?? null })) }));
}

export async function createStudioHttpServer({ env = process.env, store, service } = {}) {
  const effectiveStore = store ?? new StateStore({ path: env.PWCE_STATE_PATH ?? join(root, ".dev", "pwce", "state.json") });
  const effectiveService = service ?? await createStudioService({ store: effectiveStore, env });
  const sessions = createStudioSessionRegistry();
  const studioAuth = createStudioAuthService({ store: effectiveStore });
  const configuredUsername = env.PWCE_STUDIO_USERNAME;
  const configuredPassword = env.PWCE_STUDIO_PASSWORD;
  const configuredRecoveryCodes = env.PWCE_STUDIO_RECOVERY_CODES?.split(",").map((code) => code.trim()).filter(Boolean);
  if (configuredUsername !== undefined || configuredPassword !== undefined || configuredRecoveryCodes !== undefined) {
    if (configuredUsername === undefined || configuredPassword === undefined || !configuredRecoveryCodes?.length) throw new Error("Studio username, password, and recovery codes must be configured together");
    if (!(await studioAuth.hasAccount())) await studioAuth.initialize({ username: configuredUsername, password: configuredPassword, recoveryCodes: configuredRecoveryCodes });
  }
  const configuredStudioToken = env.PWCE_STUDIO_TOKEN ?? null;
  const gatewayPrincipalRef = env.PWCE_GATEWAY_PRINCIPAL_REF ?? "agent.fixture";
  const gatewaySiteRefs = (env.PWCE_GATEWAY_SITE_REFS ?? effectiveService.siteRefs.join(",")).split(",").filter(Boolean);
  const gatewayBinding = createGatewayHttpBinding({ store: effectiveStore, token: env.PWCE_GATEWAY_TOKEN ?? null, principalRef: gatewayPrincipalRef, siteRefs: gatewaySiteRefs, actionService: effectiveService.actionService });
  if (effectiveService.actionService) {
    effectiveService.actionService.registerGrant({ principalRef: "principal.studio", siteRefs: [effectiveService.siteRef], capabilityRefs: ["home.light.set_level"] });
    if (env.PWCE_GATEWAY_TOKEN) effectiveService.actionService.registerGrant({ principalRef: gatewayPrincipalRef, siteRefs: [effectiveService.siteRef], capabilityRefs: ["home.light.set_level"] });
  }
  const basicAgent = new BasicAgent({ gateway: gatewayBinding.gateway, siteRefs: effectiveService.siteRefs, entityId: effectiveService.entityId });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (await gatewayBinding.handle(req, res, url.pathname)) return;
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "POST" && url.pathname === "/api/session") {
          requireJsonContentType(req);
          const payload = await readJsonObjectBody(req);
          const identity = payload.recoveryCode
            ? await studioAuth.authenticateRecovery({ code: payload.recoveryCode })
            : await studioAuth.authenticate({ username: payload.username, password: payload.password });
          if (!identity) return json(res, 401, errorPayload("studio_authentication_failed", "authentication_failed"));
          const session = sessions.issue({ principalRef: identity.principalRef, siteRefs: effectiveService.siteRefs });
          res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": [`pwce_studio_session=${encodeURIComponent(session.sessionRef)}; HttpOnly; SameSite=Strict; Path=/`] });
          return res.end(JSON.stringify({ authenticated: true, transport: identity.transport, expiresAt: session.expiresAt }));
        }
        if (req.method === "GET" && url.pathname === "/api/session") {
          const { session, transport } = issueStudioSession({ authorization: req.headers.authorization, configuredToken: configuredStudioToken, sessions, siteRefs: effectiveService.siteRefs, requiresHumanAuth: await studioAuth.hasAccount() });
          res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": [`pwce_studio_session=${encodeURIComponent(session.sessionRef)}; HttpOnly; SameSite=Strict; Path=/`] });
          return res.end(JSON.stringify({ authenticated: true, transport, expiresAt: session.expiresAt }));
        }
        if (req.method === "POST" && url.pathname === "/api/session/logout") {
          const cookies = parseCookies(req.headers.cookie);
          if (cookies.pwce_studio_session && !isAllowedStudioOrigin(req.headers.origin, req.headers.host)) return json(res, 403, errorPayload("studio_origin_not_allowed", "origin_denied"));
          sessions.revoke(cookies.pwce_studio_session);
          res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": ["pwce_studio_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/"] });
          return res.end(JSON.stringify({ authenticated: false }));
        }
        const cookies = parseCookies(req.headers.cookie);
        const studioContext = getStudioContext({ authorization: req.headers.authorization, cookie: cookies.pwce_studio_session, configuredToken: configuredStudioToken, sessions, siteRefs: effectiveService.siteRefs });
        if (!studioContext) return json(res, configuredStudioToken ? 401 : 503, errorPayload(configuredStudioToken ? "studio_authentication_required" : "studio_token_not_configured", configuredStudioToken ? "authentication_required" : "configuration_unavailable"));
        if (req.method === "POST" && cookies.pwce_studio_session && !isAllowedStudioOrigin(req.headers.origin, req.headers.host)) return json(res, 403, errorPayload("studio_origin_not_allowed", "origin_denied"));
        const jsonPost = req.method === "POST" && (url.pathname === "/api/agent/message" || url.pathname === "/api/actions/preview" || url.pathname === "/api/actions/dispatch" || url.pathname === "/api/approvals" || url.pathname.endsWith("/approve"));
        if (jsonPost) requireJsonContentType(req);
        const requireSite = (siteRef) => { if (!studioContext.siteRefs.includes(siteRef)) { const error = new Error("site is outside Studio authority"); error.code = "scope_denied"; error.statusCode = 403; throw error; } };
        if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ...(await getHealth(effectiveStore)), runtime: effectiveService.runtimeStatus() });
        if (req.method === "GET" && url.pathname === "/api/sites") {
          return json(res, 200, { sites: await listAuthorizedSites({ store: effectiveStore, siteRefs: studioContext.siteRefs }) });
        }
        if (req.method === "GET" && url.pathname === "/api/capabilities") return json(res, 200, effectiveService.actionService?.snapshot() ?? { version: "1.0.0", capabilities: [] });
        if (req.method === "GET" && url.pathname === "/api/agent") return json(res, 200, basicAgent.definition);
        if (req.method === "POST" && url.pathname === "/api/agent/message") return json(res, 200, await basicAgent.answer(await readJsonObjectBody(req)));
        if (req.method === "GET" && url.pathname === "/api/context/current") { const siteRefs = (url.searchParams.get("siteRefs") ?? "").split(",").filter(Boolean); if (siteRefs.length > 1) { siteRefs.forEach(requireSite); return json(res, 200, await getCurrentAggregate(effectiveStore, { siteRefs, externalEntityId: url.searchParams.get("entityId") ?? effectiveService.entityId, property: url.searchParams.get("property") ?? "state" })); } const siteRef = url.searchParams.get("siteRef") ?? effectiveService.siteRef; requireSite(siteRef); return json(res, 200, await getCurrent(effectiveStore, { siteRef, externalEntityId: url.searchParams.get("entityId") ?? effectiveService.entityId, property: url.searchParams.get("property") ?? "state" })); }
        if (req.method === "GET" && url.pathname === "/api/context/explain") { const siteRef = url.searchParams.get("siteRef") ?? effectiveService.siteRef; requireSite(siteRef); return json(res, 200, await explainCurrent(effectiveStore, { siteRef, externalEntityId: url.searchParams.get("entityId") ?? effectiveService.entityId, property: url.searchParams.get("property") ?? "state" })); }
        if (req.method === "GET" && url.pathname === "/api/context/history") { const siteRef = url.searchParams.get("siteRef") ?? effectiveService.siteRef; requireSite(siteRef); const limitText = url.searchParams.get("limit"); const limit = limitText === null ? undefined : Number(limitText); const history = await queryHistory(effectiveStore, { siteRef, externalEntityId: url.searchParams.get("entityId") ?? effectiveService.entityId, property: url.searchParams.get("property") ?? "state", limit, cursor: url.searchParams.get("cursor") ?? undefined }); return json(res, 200, history); }
        if (req.method === "POST" && url.pathname === "/api/actions/preview") {
          if (!effectiveService.actionService) return json(res, 503, errorPayload("home_assistant_not_configured", "configuration_unavailable"));
          const request = requestFromPayload(await readJsonObjectBody(req), effectiveService); requireSite(request.siteRef); return json(res, 200, effectiveService.actionService.preview(request));
        }
        if (req.method === "POST" && url.pathname === "/api/approvals") {
          const request = requestFromPayload(await readJsonObjectBody(req), effectiveService);
          requireSite(request.siteRef);
          return json(res, 201, await effectiveService.approvalService.request({ request, requestedBy: "principal.studio" }));
        }
        const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/approve$/);
        if (req.method === "POST" && approvalMatch) { const state = await effectiveStore.load(); const approval = state.approvals[approvalMatch[1]]; if (!approval) return json(res, 404, errorPayload("approval_not_found", "not_found")); if (approval.siteRef) requireSite(approval.siteRef); return json(res, 200, await effectiveService.approvalService.approve({ approvalRef: approvalMatch[1], approvedBy: "human.local" })); }
        if (req.method === "POST" && url.pathname === "/api/actions/dispatch") {
          if (!effectiveService.actionService) return json(res, 503, errorPayload("home_assistant_not_configured", "configuration_unavailable"));
          const request = requestFromPayload(await readJsonObjectBody(req), effectiveService);
          requireSite(request.siteRef);
          const admitted = await effectiveService.actionService.authorizeDispatch(request);
          if (!admitted.action) return json(res, 403, admitted);
          const result = await effectiveService.actionService.dispatch(admitted.action.actionRef);
          return json(res, 202, { decision: admitted.decision, action: result });
        }
        const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)$/);
        if (req.method === "GET" && actionMatch) {
          const state = await effectiveStore.load();
          const action = state.actions[actionMatch[1]]; if (action) requireSite(action.siteRef);
          return action ? json(res, 200, action) : json(res, 404, errorPayload("action_not_found", "not_found"));
        }
        const evidenceMatch = url.pathname.match(/^\/api\/evidence\/([^/]+)$/);
        if (req.method === "GET" && evidenceMatch) { const state = await effectiveStore.load(); const evidence = state.observations.find((candidate) => candidate.recordId === evidenceMatch[1]); if (!evidence) return json(res, 404, errorPayload("evidence_not_found", "not_found")); requireSite(evidence.payload.siteRef); return json(res, 200, { status: "known", evidence }); }
        return json(res, 404, errorPayload("route_not_found", "not_found"));
      }
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = resolve(studioRoot, `.${requested}`);
      if (!file.startsWith(`${studioRoot}/`)) return json(res, 404, errorPayload("not_found", "not_found"));
      const content = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, "content-type": contentTypes[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(content);
    } catch (error) {
      json(res, error.statusCode ?? (/not found/i.test(error.message) ? 404 : 400), errorPayload(error.message, error.code ?? "request_failed"));
    }
  });
  server.on("close", () => effectiveService.stop?.());
  server.on("close", () => gatewayBinding.gateway.close?.());
  return { server, store: effectiveStore, service: effectiveService };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PWCE_STUDIO_PORT ?? 4173);
  const host = process.env.PWCE_STUDIO_HOST ?? "127.0.0.1";
  const { server } = await createStudioHttpServer();
  await mkdir(join(root, ".dev", "pwce"), { recursive: true });
  server.listen(port, host, () => console.log(`PWCE Studio listening at http://${host}:${port}`));
}
