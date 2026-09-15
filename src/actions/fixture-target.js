import { randomUUID } from "node:crypto";
export class FixtureActionTarget {
  // Each instance owns its own synthetic target state.
  identity = `fixture-action-target:${randomUUID()}`;
  #state = new Map();
  #mode;

  constructor({ mode = "normal" } = {}) {
    this.#mode = mode;
  }

  async invoke({ operation, siteRef, targetEntityId, parameters }) {
    if (this.#mode === "timeout") return { status: "timed_out", externalEffectOccurred: "unknown", reasonCode: "fixture_timeout" };
    if (this.#mode === "unknown") return { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "fixture_connection_lost" };
    if (operation !== "light.set_level") return { status: "failed", externalEffectOccurred: false, reasonCode: "unsupported_fixture_operation" };
    const level = parameters?.level;
    if (!Number.isFinite(level) || level < 0 || level > 1) return { status: "failed", externalEffectOccurred: false, reasonCode: "invalid_level" };
    const key = `${siteRef}::${targetEntityId}`;
    this.#state.set(key, level);
    return { status: "succeeded", externalEffectOccurred: true, observed: { siteRef, targetEntityId, property: "level", value: level } };
  }
}
