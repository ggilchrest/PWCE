import test from "node:test";
import assert from "node:assert/strict";
import { gatewayProfile } from "../src/gateway/gateway-service.js";
import { PwceAgentGatewayClient } from "../src/gateway/generated-client.js";

const operationMethods = {
  "context.getPreparedInputs": "getPreparedInputs",
  "context.query": "queryContext",
  "evidence.get": "getEvidence",
  "events.subscribe": "subscribeInvalidations",
  "authority.evaluate": "evaluate",
  "authority.getGrants": "getGrants",
  "capabilities.getSnapshot": "getCapabilities",
  "capabilities.invoke": "invoke",
  "capabilities.getInvocation": "getInvocation",
  "trace.publish": "publishTrace",
  "health.get": "health"
};

test("generated client covers every callable published gateway operation", () => {
  const methods = new Set(Object.getOwnPropertyNames(PwceAgentGatewayClient.prototype));
  for (const entry of gatewayProfile.operationCatalog) {
    if (entry.availability === "trusted_dispatch_only") {
      assert.equal(operationMethods[entry.operation], undefined, `${entry.operation} must remain trusted-only`);
      continue;
    }
    const method = operationMethods[entry.operation];
    assert.ok(method, `${entry.operation} needs an explicit generated-client mapping`);
    assert.ok(methods.has(method), `${entry.operation} maps to missing client method ${method}`);
  }
});
