import { randomUUID } from "node:crypto";

const AGENT_REF = "agent.basic";
const AGENT_VERSION = "1.0.0";

function fail(message, code = "invalid_request") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function modeFor(question) {
  const text = question.toLowerCase();
  if (/\b(history|historical|timeline|previous|recent|before)\b/.test(text)) return "history";
  if (/\b(why|explain|evidence|because)\b/.test(text)) return "explain";
  return "current";
}

function answerFor(mode, result, entityId) {
  if (mode === "history") {
    const observations = result.observations ?? [];
    if (!observations.length) return `I have no accepted history for ${entityId}.`;
    return `I found ${observations.length} accepted observation${observations.length === 1 ? "" : "s"} for ${entityId}.`;
  }
  if (result.status === "conflicted") return `I found conflicting observations for ${entityId} at the latest event time, so I will not choose one as fact.`;
  if (result.status === "stale") return `The latest accepted observation for ${entityId} is stale, so I will not present it as current.`;
  if (result.status !== "known") return `I do not have an accepted observation for ${entityId} at this boundary. It is ${result.knowledgeState ?? "unknown"}.`;
  if (mode === "explain") return `${entityId} is ${String(result.value)} based on ${result.sourceRef ?? "an accepted source"}, observed at ${result.eventTime ?? "an unknown time"}.`;
  return `${entityId} is ${String(result.value)}.`;
}

export class BasicAgent {
  #gateway;
  #principalRef;
  #token;
  #siteRefs;
  #entityId;

  constructor({ gateway, siteRefs = ["home.one"], entityId = "light.kitchen_lights", principalRef = AGENT_REF, token = randomUUID() } = {}) {
    if (!gateway) throw new Error("Basic Agent requires a gateway");
    if (!Array.isArray(siteRefs) || siteRefs.length === 0) throw new Error("Basic Agent requires at least one site");
    this.#gateway = gateway;
    this.#principalRef = principalRef;
    this.#token = token;
    this.#siteRefs = [...new Set(siteRefs)];
    this.#entityId = entityId;
    gateway.registerPrincipal({ principalRef, token, siteRefs: this.#siteRefs });
  }

  get definition() {
    return { agentRef: this.#principalRef, version: AGENT_VERSION, locality: "local", effectAuthority: "none", supportedModes: ["current", "history", "explain"], gatewayProfile: "pwce-agent-gateway.v1@1.0.0", limitations: ["This development Agent uses deterministic retrieval and does not infer facts beyond gateway results."] };
  }

  async answer({ question, siteRef = this.#siteRefs[0], entityId = this.#entityId, property = "state" } = {}) {
    if (typeof question !== "string" || question.trim().length < 1 || question.length > 512) throw fail("question must be between 1 and 512 characters");
    if (!this.#siteRefs.includes(siteRef)) throw fail("site is outside Basic Agent authority", "scope_denied");
    const mode = modeFor(question);
    const authority = this.#gateway.issueAuthorityContext({ principalRef: this.#principalRef, token: this.#token, siteRefs: [siteRef] });
    const result = await this.#gateway.requestAuthenticated({ token: this.#token, operation: "context.query", authorityContextRef: authority.authorityContextRef, mode, siteRef, externalEntityId: entityId, property, limit: 8 });
    return { agentRef: this.#principalRef, agentVersion: AGENT_VERSION, mode, siteRef, entityId, property, answer: answerFor(mode, result, entityId), evidenceRefs: result.evidenceRefs ?? result.observations?.map((observation) => observation.observationRef) ?? [], result, limitations: result.limitations ?? [] };
  }
}
