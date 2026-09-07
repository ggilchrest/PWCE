import { fixtureGatewayProfile } from "./fixture-profile.js";

function fail(message, code = "gateway_request_failed") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function modeFor(question) {
  const text = question.toLowerCase();
  if (/\b(history|historical|timeline|previous|recent|before)\b/.test(text)) return "history";
  return "current";
}

function answerFor(mode, result, entityId) {
  if (mode === "history") return result.observations?.length ? `The gateway returned ${result.observations.length} accepted observation${result.observations.length === 1 ? "" : "s"} for ${entityId}.` : `The gateway returned no accepted history for ${entityId}.`;
  if (result.status === "conflicted") return `The gateway reported conflicting observations for ${entityId}.`;
  if (result.status === "stale") return `The gateway reported stale evidence for ${entityId}.`;
  if (result.status !== "known") return `The gateway has no accepted observation for ${entityId}.`;
  return `The gateway reports ${entityId} is ${String(result.value)}.`;
}

export class FixtureExternalAgent {
  #baseUrl;
  #token;
  #fetch;
  #siteRefs;

  constructor({ baseUrl, token, siteRefs = ["home.one"], fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== "string" || !baseUrl) throw new Error("external Agent gateway URL is required");
    if (typeof token !== "string" || !token) throw new Error("external Agent gateway token is required");
    if (typeof fetchImpl !== "function") throw new Error("external Agent requires fetch");
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#siteRefs = [...new Set(siteRefs)];
  }

  async #request(path, payload, method = "POST") {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const result = await response.json();
    if (!response.ok) throw fail(result.error?.message ?? "gateway request failed", result.error?.code ?? "gateway_request_failed");
    return result;
  }

  async profile() {
    const profile = await this.#request("/gateway/v1/profile", undefined, "GET");
    const catalog = new Set((profile.operationCatalog ?? []).map((entry) => entry.operation));
    const compatible = profile.profileId === fixtureGatewayProfile.profileId
      && profile.profileVersion === fixtureGatewayProfile.profileVersion
      && profile.operationCatalogVersion === fixtureGatewayProfile.operationCatalogVersion
      && profile.operationCatalogDigest === fixtureGatewayProfile.operationCatalogDigest
      && fixtureGatewayProfile.requiredOperations.every((operation) => catalog.has(operation));
    if (!compatible) throw fail("incompatible gateway profile", "incompatible_gateway_profile");
    return profile;
  }

  async answer({ question, siteRef = this.#siteRefs[0], entityId = "light.kitchen_lights", property = "state" } = {}) {
    if (typeof question !== "string" || question.trim().length < 1 || question.length > 512) throw fail("question must be between 1 and 512 characters", "invalid_request");
    if (!this.#siteRefs.includes(siteRef)) throw fail("site is outside external Agent authority", "scope_denied");
    await this.profile();
    const authority = await this.#request("/gateway/v1/authority", { siteRefs: [siteRef] });
    const mode = modeFor(question);
    const result = await this.#request("/gateway/v1/request", { operation: "context.query", authorityContextRef: authority.authorityContextRef, mode, siteRef, externalEntityId: entityId, property, limit: 8 });
    return { agentRef: "agent.fixture.external", mode, siteRef, entityId, property, answer: answerFor(mode, result, entityId), evidenceRefs: result.evidenceRefs ?? result.observations?.map((observation) => observation.observationRef) ?? [], result, limitations: result.limitations ?? [] };
  }
}
