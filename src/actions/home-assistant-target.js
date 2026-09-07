export class HomeAssistantActionTarget {
  #adapter;

  constructor({ adapter }) {
    this.#adapter = adapter;
  }

  async invoke(action) {
    if (action.siteRef !== this.#adapter.configuration?.siteRef) return { status: "rejected", externalEffectOccurred: false, reasonCode: "target_site_mismatch" };
    if (action.executionEnvironmentRef !== "live") return { status: "rejected", externalEffectOccurred: false, reasonCode: "live_target_requires_live_environment" };
    if (action.operation !== "light.set_level") return { status: "failed", externalEffectOccurred: false, reasonCode: "unsupported_home_assistant_operation" };
    const level = action.parameters?.level;
    if (typeof level !== "number" || level < 0 || level > 1) return { status: "failed", externalEffectOccurred: false, reasonCode: "invalid_level" };
    const acknowledgement = await this.#adapter.callService("light", "turn_on", { entity_id: action.targetEntityId, brightness_pct: Math.round(level * 100) });
    return { status: "outcome_unknown", externalEffectOccurred: "unknown", dispatchAcknowledged: acknowledgement.status === "acknowledged", reasonCode: "state_observation_required" };
  }

  async reconcile(action) {
    if (action.siteRef !== this.#adapter.configuration?.siteRef) return { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "target_site_mismatch" };
    const state = await this.#adapter.getState(action.targetEntityId);
    if (!state) return { status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode: "target_state_unavailable" };
    const requestedLevel = action.parameters?.level;
    const brightness = state.rawAttributes?.brightness;
    const actualLevel = typeof brightness === "number" ? brightness / 255 : state.value === "off" ? 0 : null;
    const matches = actualLevel !== null && Math.abs(actualLevel - requestedLevel) <= 1 / 255;
    return matches
      ? { status: "succeeded", externalEffectOccurred: true, observed: { entityId: action.targetEntityId, state: state.value, level: actualLevel }, reasonCode: "state_observed_matches_request" }
      : { status: "outcome_unknown", externalEffectOccurred: "unknown", observed: { entityId: action.targetEntityId, state: state.value, level: actualLevel }, reasonCode: "state_observed_does_not_match_request" };
  }
}
