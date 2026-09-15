import { createHash } from "node:crypto";
export class HomeAssistantActionTarget {
  #adapter;
  #clock;
  identity;

  constructor({ adapter, clock = () => new Date() }) {
    this.#adapter = adapter; this.#clock = clock;
    const config = adapter.configuration;
    this.identity = config?.siteRef && config?.sourceRef && config?.baseUrl ?
      `home-assistant:${createHash('sha256').update(JSON.stringify([config.siteRef, config.sourceRef, config.baseUrl])).digest('hex')}` : null;
  }

  async checkPreconditions(action, { signal } = {}) {
    signal?.throwIfAborted();
    const deny = reasonCode => ({ allowed: false, reasonCode, observed: null }), config = this.#adapter.configuration;
    const currentIdentity = config?.siteRef && config?.sourceRef && config?.baseUrl ? `home-assistant:${createHash('sha256').update(JSON.stringify([config.siteRef, config.sourceRef, config.baseUrl])).digest('hex')}` : null;
    if (!this.identity || currentIdentity !== this.identity || action.targetIdentity !== this.identity) return deny('target_binding_changed');
    if (action.siteRef !== config.siteRef) return deny('target_site_mismatch');
    if (action.executionEnvironmentRef !== 'live') return deny('live_target_requires_live_environment');
    if (action.operation !== 'light.set_level' || typeof action.targetEntityId !== 'string' || !/^light\.[a-z0-9_]+$/.test(action.targetEntityId)) return deny('target_entity_not_a_light');
    const state = await this.#adapter.getState(action.targetEntityId, { signal }); signal?.throwIfAborted();
    const after = this.#adapter.configuration;
    if (JSON.stringify([after?.siteRef, after?.sourceRef, after?.baseUrl]) !== JSON.stringify([config.siteRef, config.sourceRef, config.baseUrl])) return deny('target_binding_changed');
    if (!state || state.siteRef !== action.siteRef || state.sourceRef !== config.sourceRef || state.externalEntityId !== action.targetEntityId || state.property !== 'state') return deny('target_state_scope_mismatch');
    if (!Number.isFinite(Date.parse(state.eventTime)) || Date.parse(state.eventTime) > this.#clock().valueOf()) return deny('target_state_time_invalid');
    if (!['on','off'].includes(state.value)) return deny('target_state_unavailable');
    // last_updated may be old for an unchanged light. This is a fresh scoped
    // GET, not reuse of a cached observation or proof that an effect occurred.
    return { allowed: true, reasonCode: 'target_state_available', observed: { siteRef: state.siteRef, sourceRef: state.sourceRef, entityId: state.externalEntityId, eventTime: state.eventTime, state: state.value } };
  }

  async invoke(action, { signal } = {}) {
    signal?.throwIfAborted();
    if (action.siteRef !== this.#adapter.configuration?.siteRef) return { status: "rejected", externalEffectOccurred: false, reasonCode: "target_site_mismatch" };
    if (action.executionEnvironmentRef !== "live") return { status: "rejected", externalEffectOccurred: false, reasonCode: "live_target_requires_live_environment" };
    if (action.operation !== "light.set_level") return { status: "failed", externalEffectOccurred: false, reasonCode: "unsupported_home_assistant_operation" };
    const level = action.parameters?.level;
    if (!Number.isFinite(level) || level < 0 || level > 1) return { status: "failed", externalEffectOccurred: false, reasonCode: "invalid_level" };
    const acknowledgement = await this.#adapter.callService("light", "turn_on", { entity_id: action.targetEntityId, brightness_pct: Math.round(level * 100) }, { signal });
    return { status: "outcome_unknown", externalEffectOccurred: "unknown", dispatchAcknowledged: acknowledgement.status === "acknowledged", reasonCode: "state_observation_required" };
  }

  async reconcile(action, { signal } = {}) {
    signal?.throwIfAborted();
    const unknown = reasonCode => ({ status: "outcome_unknown", externalEffectOccurred: "unknown", reasonCode });
    const config = this.#adapter.configuration;
    if (!this.identity || action.siteRef !== config.siteRef) return unknown("target_site_mismatch");
    if (action.executionEnvironmentRef !== "live") return unknown("live_target_requires_live_environment");
    if (action.operation !== "light.set_level" || !Number.isFinite(action.parameters?.level) || action.parameters.level < 0 || action.parameters.level > 1) return unknown("invalid_reconciliation_request");
    if (!action.attemptRef || !Number.isFinite(Date.parse(action.startedAt))) return unknown("original_attempt_required");
    const state = await this.#adapter.getState(action.targetEntityId, { signal });
    signal?.throwIfAborted();
    if (!state) return unknown("target_state_unavailable");
    if (state.siteRef !== action.siteRef || state.sourceRef !== config.sourceRef || state.externalEntityId !== action.targetEntityId) return unknown("target_state_scope_mismatch");
    const eventTime = Date.parse(state.eventTime);
    if (!Number.isFinite(eventTime) || eventTime < Date.parse(action.startedAt) || eventTime > this.#clock().valueOf()) return unknown("target_state_not_current_for_attempt");
    const requestedLevel = action.parameters.level, brightness = state.rawAttributes?.brightness;
    const actualLevel = state.value === "off" ? 0 : state.value === "on" && Number.isFinite(brightness) && brightness >= 0 && brightness <= 255 ? brightness / 255 : null;
    const matches = actualLevel !== null && Math.abs(actualLevel - requestedLevel) <= 1 / 255;
    const observed = { siteRef: state.siteRef, sourceRef: state.sourceRef, entityId: state.externalEntityId, eventTime: state.eventTime, state: state.value, level: actualLevel };
    return matches
      ? { status: "succeeded", externalEffectOccurred: true, observed, reasonCode: "state_observed_matches_request" }
      : { ...unknown("state_observed_does_not_match_request"), observed };
  }
}
