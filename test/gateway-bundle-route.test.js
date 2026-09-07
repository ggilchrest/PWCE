import test from "node:test";
import assert from "node:assert/strict";
import { gatewayBundle } from "../src/gateway/gateway-bundle.js";

test("published bundle descriptor exposes immutable artifact pins", () => {
  assert.equal(gatewayBundle.artifacts.length, 5);
  assert.equal(gatewayBundle.generatedClient.sha256.length, 64);
  assert.throws(() => { gatewayBundle.artifacts[0].sha256 = "wrong"; }, TypeError);
});
