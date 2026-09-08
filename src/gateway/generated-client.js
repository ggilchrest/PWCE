import { gatewayBundle } from "./gateway-bundle.js";
import { gatewayProfile } from "./gateway-service.js";

const MAX_TRANSPORT_BYTES = 1_048_576;

// Generated client surface for pwce-agent-gateway.v1@1.0.0.
// Keep this transport-only: Lifestream owns its mapping and provider semantics.
export class PwceAgentGatewayClient {
  #baseUrl;
  #token;
  #fetch;
  #profilePromise = null;

  constructor({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== "string" || !baseUrl) throw new Error("gateway base URL is required");
    if (typeof token !== "string" || !token) throw new Error("gateway token is required");
    if (typeof fetchImpl !== "function") throw new Error("gateway client requires fetch");
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #json(path, { method = "GET", body, signal } = {}) {
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);
    if (encodedBody !== undefined && Buffer.byteLength(encodedBody, "utf8") > MAX_TRANSPORT_BYTES) {
      const error = new Error("request body exceeds the 1 MiB transport limit");
      error.code = "limit_exceeded";
      throw error;
    }
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { method, signal, headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" }, ...(encodedBody === undefined ? {} : { body: encodedBody }) });
    const responseBytes = await response.arrayBuffer();
    if (responseBytes.byteLength > MAX_TRANSPORT_BYTES) {
      const error = new Error("response body exceeds the 1 MiB transport limit");
      error.code = "limit_exceeded";
      throw error;
    }
    let result;
    try { result = JSON.parse(new TextDecoder().decode(responseBytes)); } catch {
      const error = new Error("gateway returned malformed JSON");
      error.code = "invalid_gateway_response";
      throw error;
    }
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      const error = new Error("gateway returned an invalid JSON response");
      error.code = "invalid_gateway_response";
      throw error;
    }
    if (!response.ok) {
      const error = new Error(result.error?.message ?? "gateway request failed");
      error.code = result.error?.code ?? "gateway_request_failed";
      throw error;
    }
    return result;
  }

  async profile(options) {
    const profile = await this.#json("/gateway/v1/profile", options);
    const compatible = profile.profileId === gatewayProfile.profileId
      && profile.profileVersion === gatewayProfile.profileVersion
      && profile.bundleId === gatewayBundle.bundleId
      && profile.bundleVersion === gatewayBundle.bundleVersion
      && profile.schemaStatus === "published"
      && profile.schemaDigest === gatewayBundle.bundleDigest
      && profile.operationCatalogVersion === gatewayProfile.operationCatalogVersion
      && profile.operationCatalogDigest === gatewayProfile.operationCatalogDigest;
    if (!compatible) {
      const error = new Error("incompatible gateway profile");
      error.code = "incompatible_gateway_profile";
      throw error;
    }
    return profile;
  }

  async bundle(options) {
    await this.#ensureProfile(options);
    const bundle = await this.#json("/gateway/v1/bundle", options);
    const compatible = bundle.bundleId === gatewayBundle.bundleId
      && bundle.bundleVersion === gatewayBundle.bundleVersion
      && bundle.bundleDigest === gatewayBundle.bundleDigest
      && JSON.stringify(bundle.artifacts) === JSON.stringify(gatewayBundle.artifacts)
      && JSON.stringify(bundle.generatedClient) === JSON.stringify(gatewayBundle.generatedClient);
    if (!compatible) {
      const error = new Error("incompatible gateway bundle");
      error.code = "incompatible_gateway_bundle";
      throw error;
    }
    return bundle;
  }

  async #ensureProfile(options) {
    this.#profilePromise ??= this.profile(options).catch((error) => { this.#profilePromise = null; throw error; });
    return this.#profilePromise;
  }

  async authority(payload, options) { await this.#ensureProfile(options); return this.#json("/gateway/v1/authority", { ...options, method: "POST", body: payload }); }

  async request(payload, options) { await this.#ensureProfile(options); return this.#json("/gateway/v1/request", { ...options, method: "POST", body: payload }); }

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

  async *subscribeInvalidations({ authorityContextRef, siteRef, afterCursor = "0", limit = 100, signal } = {}) {
    await this.#ensureProfile({ signal });
    const response = await this.#fetch(this.eventsUrl({ authorityContextRef, siteRef, afterCursor, limit }), { method: "GET", signal, headers: { Authorization: `Bearer ${this.#token}`, Accept: "text/event-stream" } });
    if (!response.ok || !response.body) {
      const error = new Error(`gateway event stream failed with status ${response.status}`);
      error.code = "gateway_stream_failed";
      throw error;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = { data: [] };
    const emit = () => {
      if (!event.data.length) return null;
      const value = { id: event.id ?? null, event: event.event ?? "message", data: event.data.join("\n") };
      event = { data: [] };
      return value;
    };
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        if (Buffer.byteLength(buffer, "utf8") > MAX_TRANSPORT_BYTES) {
          const error = new Error("event stream frame exceeds the 1 MiB transport limit");
          error.code = "limit_exceeded";
          throw error;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (!line) { const parsed = emit(); if (parsed) yield parsed; continue; }
          if (line.startsWith(":")) continue;
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
          if (field === "id") event.id = value;
          else if (field === "event") event.event = value;
          else if (field === "data") event.data.push(value);
        }
        if (chunk.done) { const parsed = emit(); if (parsed) yield parsed; break; }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
