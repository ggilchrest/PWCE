export function homeAssistantConfigFromEnv(env = process.env, suffix = "HOME_ONE") {
  const baseUrl = env[`PWCE_HA_URL_${suffix}`];
  const tokenRef = env[`PWCE_HA_TOKEN_REF_${suffix}`];
  if (!baseUrl || !tokenRef) throw new Error(`missing Home Assistant configuration for ${suffix}`);
  return { baseUrl, tokenRef, siteRef: suffix.toLowerCase().replace(/_/g, "."), sourceRef: `ha.${suffix.toLowerCase().replace(/_/g, ".")}` };
}

export function resolveSecretReference(reference, env = process.env) {
  if (typeof reference !== "string" || !reference.startsWith("env://")) throw new Error("only env:// secret references are enabled in the development profile");
  const variable = reference.slice("env://".length);
  const value = env[variable];
  if (!value) throw new Error(`secret environment variable is not set: ${variable}`);
  return value;
}
