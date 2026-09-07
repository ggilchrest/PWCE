import { HomeAssistantAdapter } from "../adapters/home-assistant-adapter.js";
import { HomeAssistantActionTarget } from "../actions/home-assistant-target.js";
import { ActionService } from "../actions/action-service.js";
import { ApprovalService } from "../actions/approval-service.js";
import { homeAssistantConfigFromEnv, resolveSecretReference } from "../config/home-assistant-config.js";
import { ensureRegistration } from "../runtime/studio-registration.js";
import { ingestObservation } from "../domain/observation-service.js";
import { canReconnect, readReconnectConfig, reconnectDelay } from "../runtime/reconnect-policy.js";

const DEFAULT_ENTITY = "light.kitchen_lights";

export async function createStudioService({ store, env = process.env, fetchImpl = globalThis.fetch, websocketFactory } = {}) {
  const siteRef = "home.one";
  const sourceRef = "ha.home.one";
  const entityId = env.PWCE_STUDIO_ENTITY ?? DEFAULT_ENTITY;
  const liveEffectsEnabled = env.PWCE_ENABLE_LIVE_EFFECTS === "true";
  const config = env.PWCE_HA_URL_HOME_ONE && env.PWCE_HA_TOKEN_REF_HOME_ONE
    ? { baseUrl: env.PWCE_HA_URL_HOME_ONE, tokenRef: env.PWCE_HA_TOKEN_REF_HOME_ONE, siteRef, sourceRef }
    : null;
  let adapter = null;
  let runtimeStatus = { status: "offline", reason: "home_assistant_not_configured" };
  let stopped = false;
  let connecting = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  const secondaryRuntimes = [];
  const configuredSiteRefs = [siteRef];
  let connectLive = async () => {};
  const { initialMs: reconnectInitialMs, maxMs: reconnectMaxMs, maxAttempts: reconnectMaxAttempts } = readReconnectConfig(env);
  const setSourceHealth = async (targetSourceRef, { status, reason, lastEventTime = null }) => {
    await store.transaction((state) => { const source = state.sources[targetSourceRef]; if (source) Object.assign(source, { status, lastStatusReason: reason, lastEventTime: lastEventTime ?? source.lastEventTime, statusChangedAt: new Date().toISOString(), revision: (source.revision ?? 0) + 1 }); });
  };
  if (config) {
    adapter = new HomeAssistantAdapter({
      config,
      resolveToken: (ref) => resolveSecretReference(ref, env),
      fetchImpl,
      websocketFactory,
      onStatus: (status) => {
        if (stopped) return;
        void setSourceHealth(sourceRef, status);
        if (status.status === "connecting") runtimeStatus = { status: "degraded", reason: status.reason };
        if (status.status === "online") {
          reconnectAttempt = 0;
          runtimeStatus = { status: "online", reason: status.reason };
        }
        if ((status.status === "degraded" || status.status === "offline") && !stopped && !connecting) {
          scheduleReconnect(status.reason);
        }
      }
    });
    runtimeStatus = { status: "configured", reason: "not_synced" };
  }
  await ensureRegistration(store, { siteRef, sourceRef });
  const approvalService = new ApprovalService({ store });
  const actionService = adapter
    ? new ActionService({ store, target: new HomeAssistantActionTarget({ adapter }), approvalService, liveEffectsEnabled })
    : null;
  if (adapter && env.PWCE_STUDIO_SYNC_ON_START !== "false") {
    try {
      await adapter.getState(entityId).then(async (state) => {
        if (!state) return;
        await ingestObservation(store, state);
      await setSourceHealth(sourceRef, { status: "online", reason: "state_synced", lastEventTime: state.eventTime });
        runtimeStatus = { status: "online", reason: "state_synced" };
      });
    } catch (error) {
      runtimeStatus = { status: "degraded", reason: error.message };
      await setSourceHealth(sourceRef, { status: "degraded", reason: error.message });
    }
  }
  if (adapter && env.PWCE_STUDIO_LIVE_EVENTS !== "false") {
    const scheduleReconnect = (reason) => {
      if (stopped || connecting || reconnectTimer) return;
      if (!canReconnect({ attempt: reconnectAttempt, maxAttempts: reconnectMaxAttempts })) {
        runtimeStatus = { status: "offline", reason: "reconnect_attempts_exhausted" };
        void setSourceHealth(sourceRef, { status: "offline", reason: "reconnect_attempts_exhausted" });
        return;
      }
      const delay = reconnectDelay({ initialMs: reconnectInitialMs, maxMs: reconnectMaxMs, attempt: reconnectAttempt });
      reconnectAttempt += 1;
      runtimeStatus = { status: "degraded", reason: `reconnect_scheduled:${reason}` };
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectLive();
      }, delay);
      reconnectTimer.unref?.();
    };
    connectLive = async () => {
      if (stopped || connecting) return;
      connecting = true;
      let connectionError = null;
      try {
        await adapter.subscribeStateChanges((observation) => ingestObservation(store, observation));
        reconnectAttempt = 0;
        runtimeStatus = { status: "online", reason: "live_events_connected" };
      } catch (error) {
        connectionError = error;
        if (!stopped) {
          runtimeStatus = { status: "degraded", reason: error.message };
          await setSourceHealth(sourceRef, { status: "degraded", reason: error.message });
        }
      } finally {
        connecting = false;
        if (connectionError && !stopped) scheduleReconnect(connectionError.message);
      }
    };
    connectLive();
  }
  const suffixes = [...new Set(Object.keys(env).flatMap((key) => { const match = key.match(/^PWCE_HA_URL_(.+)$/); return match && match[1] !== "HOME_ONE" ? [match[1]] : []; }))].sort();
  for (const suffix of suffixes) {
    if (!env[`PWCE_HA_TOKEN_REF_${suffix}`]) continue;
    const secondaryConfig = homeAssistantConfigFromEnv(env, suffix);
    const secondaryRuntime = { adapter: null, reconnectTimer: null, reconnectAttempt: 0, connecting: false };
    const scheduleSecondaryReconnect = (reason) => {
      if (stopped || secondaryRuntime.connecting || secondaryRuntime.reconnectTimer) return;
      if (!canReconnect({ attempt: secondaryRuntime.reconnectAttempt, maxAttempts: reconnectMaxAttempts })) {
        void setSourceHealth(secondaryConfig.sourceRef, { status: "offline", reason: "reconnect_attempts_exhausted" });
        return;
      }
      const delay = reconnectDelay({ initialMs: reconnectInitialMs, maxMs: reconnectMaxMs, attempt: secondaryRuntime.reconnectAttempt });
      secondaryRuntime.reconnectAttempt += 1;
      secondaryRuntime.reconnectTimer = setTimeout(() => { secondaryRuntime.reconnectTimer = null; void connectSecondary(); }, delay);
      secondaryRuntime.reconnectTimer.unref?.();
    };
    const secondaryAdapter = new HomeAssistantAdapter({
      config: secondaryConfig,
      resolveToken: (ref) => resolveSecretReference(ref, env),
      fetchImpl,
      websocketFactory,
      onStatus: (status) => { if (!stopped) { void setSourceHealth(secondaryConfig.sourceRef, status); if ((status.status === "degraded" || status.status === "offline") && !secondaryRuntime.connecting) scheduleSecondaryReconnect(status.reason); } }
    });
    secondaryRuntime.adapter = secondaryAdapter;
    configuredSiteRefs.push(secondaryConfig.siteRef);
    await ensureRegistration(store, { siteRef: secondaryConfig.siteRef, sourceRef: secondaryConfig.sourceRef });
    if (env.PWCE_STUDIO_SYNC_ON_START !== "false") {
      try {
        const state = await secondaryAdapter.getState(entityId);
        if (state) {
          await ingestObservation(store, state);
          await setSourceHealth(secondaryConfig.sourceRef, { status: "online", reason: "state_synced", lastEventTime: state.eventTime });
        }
      } catch (error) { await setSourceHealth(secondaryConfig.sourceRef, { status: "degraded", reason: error.message }); }
    }
    const connectSecondary = async () => {
      if (stopped || secondaryRuntime.connecting) return;
      secondaryRuntime.connecting = true;
      try {
        await secondaryAdapter.subscribeStateChanges((observation) => ingestObservation(store, observation));
        secondaryRuntime.reconnectAttempt = 0;
      } catch (error) {
        secondaryRuntime.connecting = false;
        if (!stopped) { await setSourceHealth(secondaryConfig.sourceRef, { status: "degraded", reason: error.message }); scheduleSecondaryReconnect(error.message); }
      } finally { secondaryRuntime.connecting = false; }
    };
    if (env.PWCE_STUDIO_LIVE_EVENTS !== "false") connectSecondary();
    secondaryRuntimes.push(secondaryRuntime);
  }
  return {
    siteRef,
    sourceRef,
    siteRefs: configuredSiteRefs,
    entityId,
    runtimeStatus: () => runtimeStatus,
    adapter,
    actionService,
    approvalService,
    liveEffectsEnabled,
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      adapter?.close();
      for (const secondaryRuntime of secondaryRuntimes) { if (secondaryRuntime.reconnectTimer) clearTimeout(secondaryRuntime.reconnectTimer); secondaryRuntime.reconnectTimer = null; secondaryRuntime.adapter.close(); }
      runtimeStatus = { status: "offline", reason: "studio_stopped" };
      void setSourceHealth(sourceRef, { status: "offline", reason: "studio_stopped" });
    }
  };
}
