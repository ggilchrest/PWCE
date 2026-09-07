const refPart = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function assertRef(value, label) {
  if (typeof value !== "string" || !refPart.test(value)) throw new Error(`${label} must be a lowercase scoped reference`);
  return value;
}

export function siteEntityRef(siteRef, externalEntityId) {
  assertRef(siteRef, "siteRef");
  if (typeof externalEntityId !== "string" || externalEntityId.length < 1 || externalEntityId.length > 128) throw new Error("externalEntityId must be a non-empty bounded string");
  return `${siteRef}::${externalEntityId}`;
}

export function registerSite(state, { siteRef, name, adapterKind = "home_assistant", enabled = true }) {
  assertRef(siteRef, "siteRef");
  if (state.sites[siteRef]) throw new Error(`site already registered: ${siteRef}`);
  state.sites[siteRef] = { siteRef, name: name ?? siteRef, adapterKind, enabled, revision: 1 };
  return state.sites[siteRef];
}

export function registerSource(state, { sourceRef, siteRef, name, sourceKind = "home_assistant", providerRef = sourceKind, registrationVersion = "1.0.0", configurationVersion = "1.0.0", normalizationProfileRef = "pwce.normalize.home-assistant.v1" }) {
  assertRef(sourceRef, "sourceRef");
  if (!state.sites[siteRef]) throw new Error(`unknown site: ${siteRef}`);
  if (state.sources[sourceRef]) throw new Error(`source already registered: ${sourceRef}`);
  state.sources[sourceRef] = { sourceRef, siteRef, name: name ?? sourceRef, sourceKind, providerRef, registrationVersion, configurationVersion, normalizationProfileRef, status: "configured", revision: 1 };
  return state.sources[sourceRef];
}

export function ensureEntity(state, { siteRef, externalEntityId, displayName }) {
  if (!state.sites[siteRef]) throw new Error(`unknown site: ${siteRef}`);
  const entityRef = siteEntityRef(siteRef, externalEntityId);
  state.entities[entityRef] ??= { entityRef, siteRef, externalEntityId, displayName: displayName ?? externalEntityId, revision: 1 };
  return state.entities[entityRef];
}
