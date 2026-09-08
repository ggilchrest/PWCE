import { ingestObservation } from "../domain/observation-service.js";

export class HomeAssistantAdapter {
  #store;
  #config;
  #resolveToken;
  #fetch;
  #websocketFactory;
  #now;
  #socket;
  #connectionId = 0;
  #pendingConnectionReject = null;
  #messageId = 0;
  #subscriptionMessageId = null;
  #eventHandler;
  #onStatus;
  #requestTimeoutMs;
  #websocketTimeoutMs;

  constructor({ store, config, resolveToken, fetchImpl = globalThis.fetch, websocketFactory = (url) => new WebSocket(url), now = () => new Date(), onStatus = () => {}, requestTimeoutMs = 10_000, websocketTimeoutMs = 10_000 }) {
    if (!config?.baseUrl || !config?.tokenRef || !config?.siteRef || !config?.sourceRef) throw new Error("Home Assistant adapter requires baseUrl, tokenRef, siteRef, and sourceRef");
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error("Home Assistant request timeout must be a positive integer");
    if (!Number.isInteger(websocketTimeoutMs) || websocketTimeoutMs < 1) throw new Error("Home Assistant WebSocket timeout must be a positive integer");
    this.#store = store;
    this.#config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
    this.#resolveToken = resolveToken;
    this.#fetch = fetchImpl;
    this.#websocketFactory = websocketFactory;
    this.#now = now;
    this.#onStatus = onStatus;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#websocketTimeoutMs = websocketTimeoutMs;
  }

  get configuration() {
    return { siteRef: this.#config.siteRef, sourceRef: this.#config.sourceRef, baseUrl: this.#config.baseUrl, tokenRef: this.#config.tokenRef };
  }

  async getState(entityId) {
    const response = await this.#request(`/api/states/${encodeURIComponent(entityId)}`);
    if (!response.ok) throw new Error(`Home Assistant state request failed: ${response.status}`);
    const state = await response.json();
    return this.#normalizeState(state);
  }

  async callService(domain, service, serviceData) {
    const response = await this.#request(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, { method: "POST", body: JSON.stringify(serviceData) });
    if (!response.ok) throw new Error(`Home Assistant service request failed: ${response.status}`);
    return { status: "acknowledged", response: await response.json() };
  }

  async subscribeStateChanges(onObservation) {
    const connectionId = ++this.#connectionId;
    const token = await this.#resolveToken(this.#config.tokenRef);
    if (this.#connectionId !== connectionId) throw new Error("Home Assistant WebSocket subscription was closed before connection");
    if (!token) throw new Error("Home Assistant token reference could not be resolved");
    const socket = this.#websocketFactory(`${this.#config.baseUrl.replace(/^http/, "ws")}/api/websocket`);
    this.#socket = socket;
    this.#eventHandler = onObservation;
    this.#onStatus({ status: "connecting", reason: "websocket_connecting" });
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout;
      const current = () => this.#socket === socket && this.#connectionId === connectionId;
      const failConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.#pendingConnectionReject === reject) this.#pendingConnectionReject = null;
        reject(error);
      };
      this.#pendingConnectionReject = reject;
      timeout = setTimeout(() => {
        if (!current()) return;
        this.#onStatus({ status: "degraded", reason: "websocket_authentication_timeout" });
        failConnection(new Error("Home Assistant WebSocket authentication timed out"));
      }, this.#websocketTimeoutMs);
      timeout.unref?.();
      socket.onmessage = async ({ data }) => {
        if (!current()) return;
        let message;
        try { message = JSON.parse(data); } catch {
          this.#onStatus({ status: "degraded", reason: "websocket_invalid_message" });
          failConnection(new Error("Home Assistant WebSocket sent an invalid message"));
          return;
        }
        if (message.type === "auth_required") socket.send(JSON.stringify({ type: "auth", access_token: token }));
        else if (message.type === "auth_ok") {
          this.#subscriptionMessageId = ++this.#messageId;
          socket.send(JSON.stringify({ id: this.#subscriptionMessageId, type: "subscribe_events", event_type: "state_changed" }));
          this.#onStatus({ status: "online", reason: "websocket_authenticated", haVersion: message.ha_version ?? null });
          settled = true;
          clearTimeout(timeout);
          if (this.#pendingConnectionReject === reject) this.#pendingConnectionReject = null;
          resolve({ status: "online", haVersion: message.ha_version ?? null });
        } else if (message.type === "result" && message.id === this.#subscriptionMessageId && message.success === false) {
          this.#onStatus({ status: "degraded", reason: "websocket_subscription_failed" });
          failConnection(new Error("Home Assistant WebSocket event subscription failed"));
        } else if (message.type === "event" && message.event?.event_type === "state_changed") {
          const normalized = this.#normalizeState(message.event.data?.new_state);
          if (normalized) await onObservation(normalized);
        } else if (message.type === "auth_invalid") {
          this.#onStatus({ status: "degraded", reason: "websocket_authentication_failed" });
          failConnection(new Error("Home Assistant WebSocket authentication failed"));
        }
      };
      socket.onerror = () => {
        if (!current()) return;
        this.#onStatus({ status: "degraded", reason: "websocket_connection_failed" });
        failConnection(new Error("Home Assistant WebSocket connection failed"));
      };
      socket.onclose = () => {
        if (!current()) return;
        this.#onStatus({ status: "offline", reason: "websocket_closed" });
        failConnection(new Error("Home Assistant WebSocket closed before authentication"));
      };
    });
  }

  close() {
    const rejectPending = this.#pendingConnectionReject;
    this.#pendingConnectionReject = null;
    this.#connectionId += 1;
    this.#socket?.close();
    this.#socket = undefined;
    this.#onStatus({ status: "offline", reason: "adapter_closed" });
    rejectPending?.(new Error("Home Assistant WebSocket closed by adapter"));
  }

  async #request(path, options = {}) {
    const token = await this.#resolveToken(this.#config.tokenRef);
    if (!token) throw new Error("Home Assistant token reference could not be resolved");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    try {
      return await this.#fetch(`${this.#config.baseUrl}${path}`, { ...options, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers ?? {}) } });
    } finally {
      clearTimeout(timer);
    }
  }

  #normalizeState(state) {
    if (!state?.entity_id || !state.last_updated) return null;
    return { siteRef: this.#config.siteRef, sourceRef: this.#config.sourceRef, externalEntityId: state.entity_id, property: "state", value: state.state, eventTime: state.last_updated, quality: "reported", rawAttributes: state.attributes ?? {} };
  }
}
