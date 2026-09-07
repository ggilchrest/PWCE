export async function getHealth(store, { now = () => new Date() } = {}) {
  const state = await store.load();
  const sources = Object.values(state.sources).map((source) => ({ sourceRef: source.sourceRef, siteRef: source.siteRef, status: source.status, lastStatusReason: source.lastStatusReason ?? null, lastEventTime: source.lastEventTime ?? null, statusChangedAt: source.statusChangedAt ?? null }));
  const offline = sources.filter((source) => source.status === "offline");
  const unavailable = sources.filter((source) => source.status !== "online");
  return { status: sources.length === 0 ? "unknown" : unavailable.length === 0 ? "healthy" : "degraded", evaluatedAt: now().toISOString(), stateRevision: state.revision, sourceCount: sources.length, offlineSourceCount: offline.length, unavailableSourceCount: unavailable.length, sources };
}
