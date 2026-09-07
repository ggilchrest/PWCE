import { ingestObservation } from "../domain/observation-service.js";

export class HomeAssistantFixtureAdapter {
  #store;
  #siteRef;
  #sourceRef;
  #now;
  #sequence = 0;

  constructor({ store, siteRef, sourceRef, now = () => new Date() }) {
    this.#store = store;
    this.#siteRef = siteRef;
    this.#sourceRef = sourceRef;
    this.#now = now;
  }

  async connect() {
    await this.#setStatus("online", "fixture_connected");
    return this.health();
  }

  async disconnect(reason = "fixture_disconnected") {
    await this.#setStatus("offline", reason);
    return this.health();
  }

  async emitState({ entityId, property, value, eventTime, freshnessMs = null, quality = "nominal" }) {
    const sequence = ++this.#sequence;
    const result = await ingestObservation(this.#store, {
      siteRef: this.#siteRef,
      sourceRef: this.#sourceRef,
      externalEntityId: entityId,
      property,
      value,
      eventTime,
      freshnessMs,
      quality,
      idempotencyKey: `${this.#sourceRef}:${sequence}`
    }, { now: this.#now });
    await this.#setStatus("online", "state_received", { lastSequence: sequence, lastEventTime: result.observation.eventTime });
    return { sequence, ...result };
  }

  async health() {
    const state = await this.#store.load();
    const source = state.sources[this.#sourceRef];
    return { siteRef: this.#siteRef, sourceRef: this.#sourceRef, status: source?.status ?? "unknown", lastSequence: source?.lastSequence ?? null, lastEventTime: source?.lastEventTime ?? null, lastStatusReason: source?.lastStatusReason ?? null };
  }

  async #setStatus(status, reason, details = {}) {
    await this.#store.transaction((state) => {
      const source = state.sources[this.#sourceRef];
      if (!source) throw new Error(`unknown source: ${this.#sourceRef}`);
      Object.assign(source, { status, lastStatusReason: reason, ...details, statusChangedAt: this.#now().toISOString(), revision: (source.revision ?? 0) + 1 });
      state.audit.push({ type: "source.health.changed", sourceRef: this.#sourceRef, siteRef: this.#siteRef, status, reason, recordedAt: this.#now().toISOString() });
    });
  }
}
