import test from "node:test";
import assert from "node:assert/strict";
import { gatewayProfile } from "../src/gateway/gateway-service.js";

test("published gateway profile and nested metadata are immutable", () => {
  assert.throws(() => { gatewayProfile.operationCatalog[0].availability = "active"; }, TypeError);
  assert.throws(() => { gatewayProfile.health.status = "healthy"; }, TypeError);
  assert.throws(() => { gatewayProfile.fixtures.push({ fixtureSetId: "unexpected" }); }, TypeError);
  assert.equal(gatewayProfile.operationCatalog[0].availability, "active");
  assert.equal(gatewayProfile.health.status, "development");
});
