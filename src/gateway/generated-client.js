// Generated client surface for pwce-agent-gateway.v1@1.0.0.
// Keep this transport-only: Lifestream owns its mapping and provider semantics.
export class PwceAgentGatewayClient {
  #baseUrl;
  #token;
  #fetch;

  constructor({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== "string" || !baseUrl) throw new Error("gateway base URL is required");
    if (typeof token !== "string" || !token) throw new Error("gateway token is required");
    if (typeof fetchImpl !== "function") throw new Error("gateway client requires fetch");
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #json(path, { method = "GET", body, signal } = {}) {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { method, signal, headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error?.message ?? "gateway request failed");
      error.code = result.error?.code ?? "gateway_request_failed";
      throw error;
    }
    return result;
  }

  profile(options) { return this.#json("/gateway/v1/profile", options); }

  authority(payload, options) { return this.#json("/gateway/v1/authority", { ...options, method: "POST", body: payload }); }

  request(payload, options) { return this.#json("/gateway/v1/request", { ...options, method: "POST", body: payload }); }

  getPreparedInputs(payload, options) { return this.request({ ...payload, operation: "context.getPreparedInputs" }, options); }
  queryContext(payload, options) { return this.request({ ...payload, operation: "context.query" }, options); }
  getEvidence(payload, options) { return this.request({ ...payload, operation: "evidence.get" }, options); }
  getGrants(payload, options) { return this.request({ ...payload, operation: "authority.getGrants" }, options); }
  evaluate(payload, options) { return this.request({ ...payload, operation: "authority.evaluate" }, options); }
  getCapabilities(payload, options) { return this.request({ ...payload, operation: "capabilities.getSnapshot" }, options); }
  invoke(payload, options) { return this.request({ ...payload, operation: "capabilities.invoke" }, options); }
  getInvocation(payload, options) { return this.request({ ...payload, operation: "capabilities.getInvocation" }, options); }
  publishTrace(payload, options) { return this.request({ ...payload, operation: "trace.publish" }, options); }
  health(payload, options) { return this.request({ ...payload, operation: "health.get" }, options); }

  eventsUrl({ authorityContextRef, siteRef, afterCursor = "0", limit = 100 } = {}) {
    const params = new URLSearchParams({ authorityContextRef, siteRef, afterCursor, limit: String(limit) });
    return `${this.#baseUrl}/gateway/v1/events?${params}`;
  }
}
