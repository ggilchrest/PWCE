import { ingestObservation } from "../domain/observation-service.js";
import { registerSite, registerSource } from "../domain/identity.js";

export class HomeAssistantRuntime {
  #store;
  #adapter;
  #config;

  constructor({ store, adapter, config }) {
    this.#store = store;
    this.#adapter = adapter;
    this.#config = config;
  }

  async ensureRegistration() {
    await this.#store.transaction((state) => {
      if (!state.sites[this.#config.siteRef]) registerSite(state, { siteRef: this.#config.siteRef, name: this.#config.siteRef, adapterKind: "home_assistant" });
      if (!state.sources[this.#config.sourceRef]) registerSource(state, { sourceRef: this.#config.sourceRef, siteRef: this.#config.siteRef, name: this.#config.sourceRef, sourceKind: "home_assistant" });
    });
  }

  async sync(entityIds, { now = () => new Date() } = {}) {
    await this.ensureRegistration();
    const results = [];
    for (const entityId of entityIds) {
      const state = await this.#adapter.getState(entityId);
      if (!state) continue;
      results.push(await ingestObservation(this.#store, state, { now }));
    }
    return results;
  }

  async startLiveEvents({ now = () => new Date() } = {}) {
    await this.ensureRegistration();
    return this.#adapter.subscribeStateChanges((observation) => ingestObservation(this.#store, observation, { now }));
  }

  stop() {
    this.#adapter.close();
  }
}
