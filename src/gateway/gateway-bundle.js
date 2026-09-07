export const gatewayBundle = Object.freeze({
  bundleId: "pwce-agent-gateway.bundle.v1",
  bundleVersion: "1.0.0",
  bundleDigest: "2eb0c47b65cc254edf09b2893fab1eb36e00142eb361649798bec65c2f08fe11",
  artifacts: Object.freeze([
    Object.freeze({ path: "contracts/gateway/operation-catalog.json", sha256: "51bfb941913fc27578dc3c4b3ca038d4bfdf4433eda72f2069173503e7b19a0c" }),
    Object.freeze({ path: "contracts/gateway/pwce-agent-gateway-profile.schema.json", sha256: "268a4e670ba9b32457725944c87ec46fda7dda821dc2f48fc5d8ff022f434e36" }),
    Object.freeze({ path: "contracts/gateway/pwce-agent-gateway-request.schema.json", sha256: "56fdd84719ddbe6d5d2a9644e9079b25df2e719dcbf0a9e33b3bf16d79760175" }),
    Object.freeze({ path: "contracts/gateway/pwce-agent-gateway-response.schema.json", sha256: "06fc6a9635c192329d43723f596330a336f1f3e57edd05e7d634110ebbb6f9ae" })
  ]),
  generatedClient: Object.freeze({ path: "src/gateway/generated-client.js", sha256: "2b5bc339e0e50b021af274d042a99e2443be8ce241adc7ff1db547cb1a12e96c" })
});
