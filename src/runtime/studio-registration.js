import { registerSite, registerSource } from "../domain/identity.js";

export async function ensureRegistration(store, { siteRef, sourceRef }) {
  await store.transaction((state) => {
    if (!state.sites[siteRef]) registerSite(state, { siteRef, name: siteRef, adapterKind: "home_assistant" });
    if (!state.sources[sourceRef]) registerSource(state, { sourceRef, siteRef, name: sourceRef, sourceKind: "home_assistant" });
  });
}
